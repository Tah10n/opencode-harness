export function checksum(input){let sum=0;for(const x of input)sum=(sum+x)>>>0;return sum;}
