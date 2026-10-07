import crypto from "node:crypto";
import dgram from "node:dgram";
import net from "node:net";

export type LineBox = {
  kind: "mikrotik" | "radius";
  host: string;
  port: number;
  user: string;
  secret: string;
  database: string;
  coaSecret: string;
};

export type LinePush = { state: "ok" | "warn" | "error"; detail: string };

const WAIT_MS = 8000;

export async function pushLine(box: LineBox, lineName: string, up: boolean): Promise<LinePush> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/.test(lineName)) {
    return { state: "error", detail: "That PPPoE username cannot be sent to the network box." };
  }
  if (!box.host || !/^[A-Za-z0-9.-]{1,253}$/.test(box.host) || box.host.includes("..")) {
    return { state: "error", detail: "The network line did not change. The network box address is not valid." };
  }
  if (!box.secret) {
    return { state: "error", detail: "The network line did not change. The network box has no password saved." };
  }
  if (box.kind === "mikrotik") return mikrotikPush(box, lineName, up);
  if (!box.database) return { state: "error", detail: "The network line did not change. The RADIUS database name is missing." };
  return radiusPush(box, lineName, up);
}

function encodeLength(length: number) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  if (length < 0x200000) return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
  if (length < 0x10000000) {
    return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }
  return Buffer.from([0xf0, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}

function encodeSentence(words: string[]) {
  const parts = words.map((word) => {
    const body = Buffer.from(word, "utf8");
    return Buffer.concat([encodeLength(body.length), body]);
  });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

function readLength(buf: Buffer, offset: number): { length: number; next: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
  if ((first & 0xc0) === 0x80) {
    if (buf.length < offset + 2) return null;
    return { length: ((first & 0x3f) << 8) + buf[offset + 1], next: offset + 2 };
  }
  if ((first & 0xe0) === 0xc0) {
    if (buf.length < offset + 3) return null;
    return { length: ((first & 0x1f) << 16) + (buf[offset + 1] << 8) + buf[offset + 2], next: offset + 3 };
  }
  if ((first & 0xf0) === 0xe0) {
    if (buf.length < offset + 4) return null;
    return {
      length: ((first & 0x0f) << 24) + (buf[offset + 1] << 16) + (buf[offset + 2] << 8) + buf[offset + 3],
      next: offset + 4,
    };
  }
  if (first === 0xf0) {
    if (buf.length < offset + 5) return null;
    return { length: buf.readUInt32BE(offset + 1), next: offset + 5 };
  }
  throw new Error("The router sent a reply that could not be read.");
}

function takeSentence(holder: { buf: Buffer }): { tag: string; words: string[] } | null {
  const words: string[] = [];
  let offset = 0;
  while (offset < holder.buf.length) {
    const parsed = readLength(holder.buf, offset);
    if (!parsed) return null;
    if (parsed.length === 0) {
      holder.buf = holder.buf.subarray(parsed.next);
      return { tag: words[0] ?? "", words: words.slice(1) };
    }
    const end = parsed.next + parsed.length;
    if (holder.buf.length < end) return null;
    words.push(holder.buf.subarray(parsed.next, end).toString("utf8"));
    offset = end;
  }
  return null;
}

function readSentence(socket: net.Socket, holder: { buf: Buffer }) {
  return new Promise<{ tag: string; words: string[] }>((resolve, reject) => {
    const finish = (error?: Error, sentence?: { tag: string; words: string[] }) => {
      socket.off("data", onData);
      socket.off("error", onError);
      if (error) reject(error);
      else if (sentence) resolve(sentence);
    };
    const pull = () => {
      try {
        const sentence = takeSentence(holder);
        if (sentence) finish(undefined, sentence);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("The router sent a reply that could not be read."));
      }
    };
    const onData = (chunk: Buffer) => {
      holder.buf = Buffer.concat([holder.buf, chunk]);
      pull();
    };
    const onError = (error: Error) => finish(error);
    socket.on("data", onData);
    socket.on("error", onError);
    pull();
  });
}

function valueOf(words: string[], key: string) {
  const prefix = `=${key}=`;
  const found = words.find((word) => word.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function wordsToRow(words: string[]) {
  const row: Record<string, string> = {};
  for (const word of words) {
    if (!word.startsWith("=")) continue;
    const body = word.slice(1);
    const split = body.indexOf("=");
    if (split < 0) continue;
    row[body.slice(0, split)] = body.slice(split + 1);
  }
  return row;
}

function openSocket(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("The router did not answer.")), WAIT_MS);
    const onError = (error: Error) => {
      clearTimeout(timer);
      fail(error);
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.off("error", onError);
      socket.setTimeout(WAIT_MS);
      socket.on("timeout", () => socket.destroy(new Error("The router did not answer.")));
      socket.on("error", () => {});
      resolve(socket);
    });
  });
}

async function call(socket: net.Socket, holder: { buf: Buffer }, words: string[]) {
  socket.write(encodeSentence(words));
  const rows: Record<string, string>[] = [];
  let trap = "";
  for (let i = 0; i < 40; i += 1) {
    const sentence = await readSentence(socket, holder);
    if (sentence.tag === "!re") {
      rows.push(wordsToRow(sentence.words));
      continue;
    }
    if (sentence.tag === "!trap" || sentence.tag === "!fatal") {
      trap = valueOf(sentence.words, "message") || "The router refused the change.";
      if (sentence.tag === "!fatal") return { rows, ret: "", trap };
      continue;
    }
    if (sentence.tag === "!done") return { rows, ret: valueOf(sentence.words, "ret"), trap };
  }
  throw new Error("The router sent a reply that could not be read.");
}

async function login(socket: net.Socket, holder: { buf: Buffer }, user: string, password: string) {
  const first = await call(socket, holder, ["/login", `=name=${user}`, `=password=${password}`]);
  if (!first.trap && !first.ret) return;
  let challenge = first.ret;
  if (!challenge) {
    const opened = await call(socket, holder, ["/login"]);
    challenge = opened.ret;
  }
  if (!challenge) throw new Error("The router refused the login.");
  const digest = crypto
    .createHash("md5")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(password, "utf8"), Buffer.from(challenge, "hex")]))
    .digest("hex");
  const second = await call(socket, holder, ["/login", `=name=${user}`, `=response=00${digest}`]);
  if (second.trap) throw new Error("The router refused the login.");
}

function routerMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith("The router")) return error.message;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ECONNRESET" || code === "EAI_AGAIN") {
    return "The router did not answer.";
  }
  return "The router did not answer.";
}

async function mikrotikPush(box: LineBox, lineName: string, up: boolean): Promise<LinePush> {
  let socket: net.Socket | null = null;
  try {
    socket = await openSocket(box.host, box.port || 8728);
    const holder = { buf: Buffer.alloc(0) };
    await login(socket, holder, box.user, box.secret);
    const listed = await call(socket, holder, ["/ppp/secret/print", "=.proplist=.id", `?name=${lineName}`]);
    if (listed.trap) return { state: "error", detail: "The router refused the change, so the network line did not change." };
    const ids = listed.rows.map((row) => row[".id"]).filter(Boolean);
    if (ids.length === 0) return { state: "error", detail: "That PPPoE username is not on the router, so the network line did not change." };
    for (const id of ids) {
      const set = await call(socket, holder, ["/ppp/secret/set", `=.id=${id}`, `=disabled=${up ? "no" : "yes"}`]);
      if (set.trap) return { state: "error", detail: "The router refused the change, so the network line did not change." };
    }
    if (!up) {
      const active = await call(socket, holder, ["/ppp/active/print", "=.proplist=.id", `?name=${lineName}`]);
      if (active.trap) {
        return { state: "warn", detail: "The login is disabled on the router. The current session could not be dropped." };
      }
      for (const row of active.rows) {
        if (!row[".id"]) continue;
        const removed = await call(socket, holder, ["/ppp/active/remove", `=.id=${row[".id"]}`]);
        if (removed.trap) return { state: "warn", detail: "The login is disabled on the router. The current session could not be dropped." };
      }
    }
    return {
      state: "ok",
      detail: up ? "The line is active on the router." : "The line is disconnected on the router.",
    };
  } catch (error) {
    return { state: "error", detail: `The network line did not change. ${routerMessage(error)}` };
  } finally {
    socket?.destroy();
  }
}

function radiusAttribute(type: number, value: Buffer) {
  return Buffer.concat([Buffer.from([type, value.length + 2]), value]);
}

function disconnectPacket(secret: string, username: string, sessionId: string, nasIp: string) {
  const attributes: Buffer[] = [radiusAttribute(1, Buffer.from(username, "utf8"))];
  if (sessionId && sessionId.length <= 253) attributes.push(radiusAttribute(44, Buffer.from(sessionId, "utf8")));
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(nasIp)) {
    const parts = nasIp.split(".").map((part) => Number(part));
    if (parts.every((part) => part >= 0 && part <= 255)) attributes.push(radiusAttribute(4, Buffer.from(parts)));
  }
  const body = Buffer.concat(attributes);
  const header = Buffer.alloc(4);
  header[0] = 40;
  header[1] = crypto.randomBytes(1)[0];
  header.writeUInt16BE(20 + body.length, 2);
  const authenticator = crypto.createHash("md5").update(Buffer.concat([header, Buffer.alloc(16), body, Buffer.from(secret, "utf8")])).digest();
  return Buffer.concat([header, authenticator, body]);
}

function signedReply(packet: Buffer, requestAuth: Buffer, secret: string) {
  if (packet.length < 20) return false;
  const expected = crypto
    .createHash("md5")
    .update(Buffer.concat([packet.subarray(0, 4), requestAuth, packet.subarray(20), Buffer.from(secret, "utf8")]))
    .digest();
  const received = packet.subarray(4, 20);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function disconnectSession(host: string, secret: string, username: string, sessionId: string) {
  const packet = disconnectPacket(secret, username, sessionId, host);
  const requestAuth = packet.subarray(4, 20);
  return new Promise<boolean>((resolve) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 4000);
    socket.once("error", () => {
      clearTimeout(timer);
      socket.close();
      resolve(false);
    });
    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      const code = message[0];
      resolve((code === 41 || code === 42) && signedReply(message, requestAuth, secret) && code === 41);
    });
    socket.send(packet, 3799, host, (error) => {
      if (!error) return;
      clearTimeout(timer);
      socket.close();
      resolve(false);
    });
  });
}

function radiusMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "ER_ACCESS_DENIED_ERROR" || code === "ER_ACCESS_DENIED_NO_PASSWORD_ERROR") return "The RADIUS database refused the login.";
  if (code === "ER_BAD_DB_ERROR") return "That RADIUS database name was not found.";
  if (code === "ER_NO_SUCH_TABLE") return "The RADIUS database is missing radcheck or radacct.";
  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    code === "PROTOCOL_CONNECTION_LOST"
  ) {
    return "The RADIUS database did not answer.";
  }
  return "The RADIUS database could not be updated.";
}

async function radiusPush(box: LineBox, lineName: string, up: boolean): Promise<LinePush> {
  try {
    return await radiusUpdate(box, lineName, up);
  } catch (error) {
    return { state: "error", detail: `The network line did not change. ${radiusMessage(error)}` };
  }
}

async function radiusUpdate(box: LineBox, lineName: string, up: boolean): Promise<LinePush> {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host: box.host,
    port: box.port || 3306,
    user: box.user,
    password: box.secret,
    database: box.database,
    connectTimeout: WAIT_MS,
    multipleStatements: false,
  });
  try {
    await conn.execute("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND op = ':=' AND value = 'Reject'", [lineName]);
    if (up) return { state: "ok", detail: "The line can connect again." };
    await conn.execute("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Auth-Type', ':=', 'Reject')", [lineName]);
    if (!box.coaSecret) {
      return {
        state: "warn",
        detail: "The line is blocked for the next login. Add the disconnect secret in Settings to drop a session that is already online.",
      };
    }
    const [rows] = await conn.execute("SELECT nasipaddress, acctsessionid FROM radacct WHERE username = ? AND acctstoptime IS NULL", [lineName]);
    const sessions = Array.isArray(rows) ? (rows as { nasipaddress?: unknown; acctsessionid?: unknown }[]) : [];
    if (sessions.length === 0) return { state: "ok", detail: "The line is blocked on RADIUS." };
    let failed = 0;
    for (const session of sessions) {
      const nas = String(session.nasipaddress ?? "");
      const sessionId = String(session.acctsessionid ?? "");
      if (!nas || !(await disconnectSession(nas, box.coaSecret, lineName, sessionId))) failed += 1;
    }
    if (failed === 0) return { state: "ok", detail: "The line is blocked on RADIUS and the current session was dropped." };
    return { state: "warn", detail: "The line is blocked for the next login. The current session could not be dropped." };
  } finally {
    await conn.end().catch(() => {});
  }
}
