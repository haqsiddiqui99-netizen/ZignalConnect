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
}: ReturnType<typeof usePinPlace> & { requiredPlace?: boolean }) {
  return (
    <>
      <div className="isp-line three">
        <label className="field">
          <span>City</span>
          <input name="city" required={requiredPlace} value={cityName} onChange={(event) => setCityName(event.target.value)} />
        </label>
        <label className="field">
          <span>State</span>
          <select name="state" required={requiredPlace} value={stateName} onChange={(event) => setStateName(event.target.value)}>
            <option value="">{requiredPlace ? "Select state" : "Not set"}</option>
            {states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Country</span>
          <input name="country" required maxLength={40} value={countryName} onChange={(event) => setCountryName(event.target.value)} />
        </label>
      </div>
      <p className="fine">{note || "City, state, and country fill in from the PIN code. You can still change them."}</p>
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
          <span>Mobile</span>
          <input name="mobile" inputMode="numeric" required defaultValue={mobile} placeholder="98xxxxxxxx" />
        </label>
        <label className="field">
          <span>PIN code</span>
          <input
            name="pincode"
            inputMode="numeric"
            required
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="400001"
            value={place.pin}
            onChange={(event) => void place.onPin(event.target.value)}
          />
        </label>
      </div>
      {showArea ? (
        <label className="field">
          <span>Area or branch</span>
          <input name="area" defaultValue={area} placeholder="West, Ward 12, Franchise A" />
        </label>
      ) : null}
      <label className="field">
        <span>Service address</span>
        <input name="address" required defaultValue={address} />
      </label>
      <PlaceFields {...place} />
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
            placeholder="400001"
            value={place.pin}
            onChange={(event) => void place.onPin(event.target.value)}
          />
        </label>
      </div>
      <PlaceFields {...place} requiredPlace={required} />
    </>
  );
}
