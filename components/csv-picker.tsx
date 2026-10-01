"use client";

export function CsvPicker() {
  return (
    <label className="field">
      <span>Spreadsheet file</span>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const area = document.querySelector<HTMLTextAreaElement>("textarea[name=csv]");
          if (area) area.value = text;
        }}
      />
    </label>
  );
}
