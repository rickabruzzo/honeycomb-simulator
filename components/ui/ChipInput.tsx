import React, { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";

interface ChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChipInput({
  value,
  onChange,
  placeholder = "Type and press Enter or comma",
  disabled = false,
}: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addChip = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Deduplicate (case-insensitive)
    const lowercaseValues = value.map((v) => v.toLowerCase());
    if (lowercaseValues.includes(trimmed.toLowerCase())) {
      setInputValue("");
      return;
    }

    onChange([...value, trimmed]);
    setInputValue("");
  };

  const removeChip = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === "," || e.key === "Comma") {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Delete last chip if input is empty
      removeChip(value.length - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Check if comma was typed
    if (newValue.includes(",")) {
      const parts = newValue.split(",");
      // Add all complete parts except the last one (which might be partial)
      parts.slice(0, -1).forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) {
          const lowercaseValues = value.map((v) => v.toLowerCase());
          if (!lowercaseValues.includes(trimmed.toLowerCase())) {
            onChange([...value, trimmed]);
          }
        }
      });
      // Keep the last part in the input (after the comma)
      setInputValue(parts[parts.length - 1]);
    } else {
      setInputValue(newValue);
    }
  };

  return (
    <div
      className={`w-full bg-black/30 border border-white/20 rounded px-2 py-1.5 text-sm flex flex-wrap gap-1 items-center outline-none focus-within:border-white/30 focus-within:ring-2 focus-within:ring-white/10 ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {value.map((chip, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 bg-white/10 text-gray-100 rounded-full px-2 py-0.5 text-xs"
        >
          {chip}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeChip(index)}
              className="hover:bg-white/20 rounded-full p-0.5 transition"
              aria-label={`Remove ${chip}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="flex-1 min-w-[120px] bg-transparent text-gray-100 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
      />
    </div>
  );
}
