"use client";

import { lookupOpenDeskPincode, lookupPincode } from "@/lib/actions";
import { INDIAN_STATES } from "@/lib/tax";
import { useRef, useState } from "react";

function usePinPlace(pincode: string, city: string, state: string, country: string, openDesk = false) {
  const [pin, setPin] = useState(pincode);
  const [cityName, setCityName] = useState(city);
  const [stateName, setStateName] = useState(state);
  const [countryName, setCountryName] = useState(country || "India");
  const [note, setNote] = useState("");
  const requested = useRef("");

  async function onPin(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    requested.current = digits;
    if (digits.length !== 6) {
      setNote("");
      return;
    }
    setNote("Looking up this PIN code…");
    const result = openDesk ? await lookupOpenDeskPincode(digits) : await lookupPincode(digits);
    if (requested.current !== digits) return;
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setCityName(result.city);
    setStateName(result.state);
    setCountryName(result.country);
    setNote(`${result.city}, ${result.state}, ${result.country}`);
  }

  const states = stateName && !INDIAN_STATES.includes(stateName) ? [stateName, ...INDIAN_STATES] : INDIAN_STATES;
  return { pin, cityName, setCityName, stateName, setStateName, countryName, setCountryName, note, onPin, states };
}

function PlaceFields({
  cityName,
  setCityName,
  stateName,
  setStateName,
  countryName,
  setCountryName,
  states,
  note,
  requiredPlace = true,
  hint = true,
}: ReturnType<typeof usePinPlace> & { requiredPlace?: boolean; hint?: boolean }) {
  return (
    <>
      <div className="isp-line three">
        <label className="field">
          <span>
            City {requiredPlace ? <i className="req" aria-hidden="true">*</i> : null}
          </span>
          <input name="city" required={requiredPlace} minLength={requiredPlace ? 2 : undefined} value={cityName} onChange={(event) => setCityName(event.target.value)} />
        </label>
        <label className="field">
          <span>
            State {requiredPlace ? <i className="req" aria-hidden="true">*</i> : null}
          </span>
          <select name="state" required={requiredPlace} value={stateName} onChange={(event) => setStateName(event.target.value)}>
            <option value="">{requiredPlace ? "Select state" : "Not set"}</option>
            {states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Country <i className="req" aria-hidden="true">*</i>
          </span>
          <input name="country" required minLength={2} maxLength={40} value={countryName} onChange={(event) => setCountryName(event.target.value)} />
        </label>
      </div>
      {note ? <p className="fine">{note}</p> : hint ? <p className="fine">City, state, and country fill in from the PIN code. You can still change them.</p> : null}
    </>
  );
}

export function ServiceAddressFields({
  mobile = "",
  address = "",
  area = "",
  showArea = false,
  city = "",
  pincode = "",
  state = "",
  country = "India",
}: {
  mobile?: string;
  address?: string;
  area?: string;
  showArea?: boolean;
  city?: string;
  pincode?: string;
  state?: string;
  country?: string;
}) {
  const place = usePinPlace(pincode, city, state, country);

  return (
    <>
      <div className="row-2">
        <label className="field">
          <span>
            Mobile <i className="req" aria-hidden="true">*</i>
          </span>
          <input
            name="mobile"
            inputMode="numeric"
            required
            minLength={10}
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            title="10-digit mobile number starting with 6, 7, 8, or 9"
            defaultValue={mobile}
          />
        </label>
        <label className="field">
          <span>
            PIN code <i className="req" aria-hidden="true">*</i>
          </span>
          <input
            name="pincode"
            inputMode="numeric"
            required
            maxLength={6}
            pattern="[0-9]{6}"
            title="6-digit PIN code"
            value={place.pin}
            onChange={(event) => void place.onPin(event.target.value)}
          />
        </label>
      </div>
      {showArea ? (
        <label className="field">
          <span>Area or branch</span>
          <input name="area" defaultValue={area} />
        </label>
      ) : null}
      <label className="field">
        <span>
          Service address <i className="req" aria-hidden="true">*</i>
        </span>
        <input
          name="address"
          required
          minLength={4}
          maxLength={160}
          pattern=".*[A-Za-z0-9].*"
          title="Enter the service address, at least 4 characters"
          defaultValue={address}
        />
      </label>
      <PlaceFields {...place} hint={false} />
    </>
  );
}

export function IspPincodeFields({
  address = "",
  pincode = "",
  city = "",
  state = "",
  country = "India",
  addressLabel = "Address",
  required = false,
  openDesk = false,
  examples = true,
  addressValue,
  onAddress,
}: {
  address?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
  addressLabel?: string;
  required?: boolean;
  openDesk?: boolean;
  examples?: boolean;
  addressValue?: string;
  onAddress?: (value: string) => void;
}) {
  const place = usePinPlace(pincode, city, state, country, openDesk);
  return (
    <>
      <div className="row-2">
        <label className="field">
          <span>{addressLabel}</span>
          {onAddress ? (
            <input
              name="address"
              required={required}
              maxLength={160}
              value={addressValue ?? ""}
              onChange={(event) => onAddress(event.target.value)}
            />
          ) : (
            <input name="address" required={required} maxLength={160} defaultValue={address} />
          )}
        </label>
        <label className="field">
          <span>PIN code</span>
          <input
            name="pincode"
            inputMode="numeric"
            required={required}
            maxLength={6}
            pattern="[0-9]{6}"
            title="6-digit PIN code"
            placeholder={examples ? "400001" : undefined}
            value={place.pin}
            onChange={(event) => void place.onPin(event.target.value)}
          />
        </label>
      </div>
      <PlaceFields
        {...place}
        requiredPlace={required}
        note={examples ? undefined : "City, state, and country fill in from the PIN code."}
      />
    </>
  );
}
