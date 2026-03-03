"use client";

import { parseDate } from "chrono-node";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { GhostInput } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatDate(date: Date | undefined) {
  if (!date) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function CustomCalendar({ onChange }: { onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("Today");
  const [date, setDate] = React.useState<Date | undefined>(parseDate(value) || undefined);
  const [month, setMonth] = React.useState<Date | undefined>(date);

  React.useEffect(() => {
    onChange(value);
  }, [value]);

  function setInnerText(date: Date | undefined) {
    if (date) {
      if (date.toDateString() === new Date().toDateString()) {
        setValue("Today");
        return;
      }
      setValue(formatDate(date));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex gap-2">
        <GhostInput
          id="date"
          value={value}
          placeholder="Tomorrow or next week"
          className="bg-transparent pr-10 py-8"
          onChange={(e) => {
            setValue(e.target.value);
            const date = parseDate(e.target.value);
            if (date) {
              setDate(date);
              setMonth(date);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
            if (e.key === "Enter") {
              setInnerText(date);
            }
          }}
          onBlur={() => {
            setInnerText(date);
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button id="date-picker" variant="ghost" className="absolute top-1/2 right-2 size-6 -translate-y-1/2">
              <CalendarIcon className="size-3.5" />
              <span className="sr-only">Select date</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              captionLayout="dropdown"
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                setDate(date);
                setValue(formatDate(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
