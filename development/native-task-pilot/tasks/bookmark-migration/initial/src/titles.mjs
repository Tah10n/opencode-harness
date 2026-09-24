import {load} from './storage.mjs';export function listTitles(file){return load(file).bookmarks.map(x=>x.title);}
