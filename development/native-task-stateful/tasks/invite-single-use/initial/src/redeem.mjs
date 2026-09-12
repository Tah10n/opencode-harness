export function redeem(book,token,now){const invite=book.peek(token);if(!invite)return {status:'missing'};book.join(invite.team,invite.email);return {status:'joined',team:invite.team};}
