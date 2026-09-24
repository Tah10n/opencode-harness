# meeting-buffer-search

Reservations and meetings are half-open intervals, so touching endpoints do not conflict. All rooms must be available simultaneously. Buffer expands each reservation symmetrically before finding the earliest start; unsorted/overlapping reservations are accepted and not mutated.
