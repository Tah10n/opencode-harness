# path-edit-transaction

Apply set/insert/remove sequentially on a detached working tree. Array indices must be numbers: set/remove require existing slots; insert permits length. Object set adds own fields; remove requires an own field. Missing parents are not created, inherited properties are not traversed, and special names remain own data. Empty path only sets root. Invalid names throw TypeError; path errors RangeError. Failure leaves inputs unchanged.
