"use client";

import { SearchIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EventQuery } from "@/lib/events/query";
import { eventTypes, type SortKey } from "@/types/event";
import { industries, type Industry } from "@/types/profile";

const industryItems = industries.map((industry) => ({
  label: industry,
  value: industry,
}));

export function EventFilters({
  query,
  onChange,
}: {
  query: EventQuery;
  onChange: (query: EventQuery) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search events"
          placeholder="Search title, organizer, or place"
          value={query.search}
          onChange={(event) => onChange({ ...query, search: event.target.value })}
        />
      </InputGroup>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <Select
            items={industryItems}
            multiple
            value={query.industries}
            onValueChange={(value) =>
              onChange({ ...query, industries: value as Industry[] })
            }
          >
            <SelectTrigger className="w-full lg:w-56">
              <SelectValue>
                {(value: Industry[]) =>
                  value.length === 0 ? "All industries" : `${value.length} industries`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {industryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ToggleGroup
            multiple
            variant="outline"
            spacing={2}
            value={query.eventTypes}
            onValueChange={(eventTypes) =>
              onChange({
                ...query,
                eventTypes: eventTypes as EventQuery["eventTypes"],
              })
            }
            aria-label="Event types"
            className="flex-wrap justify-start"
          >
            {eventTypes.map((type) => (
              <ToggleGroupItem key={type} value={type}>
                {type}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ToggleGroup
          variant="outline"
          spacing={2}
          value={[query.sort]}
          onValueChange={(value) => {
            const next = value[0] as SortKey | undefined;
            if (next) onChange({ ...query, sort: next });
          }}
          aria-label="Sort events"
        >
          <ToggleGroupItem value="relevance">Relevance</ToggleGroupItem>
          <ToggleGroupItem value="date">Event date</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
