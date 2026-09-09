# zoned-time-offset-records

Parse exact second-resolution fixed-offset timestamps with local years2000..2099. Validate calendar/time and offsets up to14:00; no fractions, missing offsets or leap seconds. Both signed zero offsets normalize to0/Z. Formatting uses UTC arithmetic plus stored offset, independent of host timezone. Offset changes preserve instant but reject local years outside range. Records require safe integer epoch milliseconds divisible by1000 and integer minute offsets. Text errors are TypeError; record errors RangeError. IANA zones/DST are not implemented.
