# legacy-date-parser

parseDate accepts exactly YYYY-MM-DD or YYYY-Www-d and returns a calendar YYYY-MM-DD string. Input calendar/week years are2000..2099. Calendar dates are Gregorian-valid; ISO weekdays run Monday1 to Sunday7, and week1 contains January4. Weeks01-52 are accepted; week53 only when it exists in that ISO year. Adjacent-year outputs can include2100, which does not extend accepted calendar input years. Invalid dates/padding/case/types or extra text throw TypeError. UTC arithmetic avoids host-timezone conversion; no permissive rollover parsing. Run npm test.
