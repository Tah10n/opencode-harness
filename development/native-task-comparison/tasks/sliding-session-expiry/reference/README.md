# sliding-session-expiry

Expiry is the minimum of absolute created+maxAge and sliding lastSeen+idle. At or beyond it touch is inactive; otherwise touch returns a detached advanced state. Earlier timestamps reject. This is pure timestamp evaluation, not a sticky expiry history, and no system clock is read. Snapshots retain exact timestamps and fields created,lastSeen,idle,maxAge; validate integer bounds and created<=lastSeen<absolute deadline. Malformed JSON throws SyntaxError, invalid state TypeError.
