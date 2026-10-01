import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-main">
      <h1 className="serif">That page is not on this desk.</h1>
      <p className="fine">The link may be old, or the subscriber was never added.</p>
      <p>
        <Link className="btn" href="/">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
