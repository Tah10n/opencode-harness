export function findTrail(nodes,id){for(const n of nodes){if(n.id===id)return [n];const rest=findTrail(n.children,id);if(rest)return [n,...rest];}return null;}
