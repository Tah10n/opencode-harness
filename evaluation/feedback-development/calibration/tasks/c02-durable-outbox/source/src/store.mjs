export class MemoryStore {
 constructor(snapshot={nextSequence:1,records:[]}) { this.value=structuredClone(snapshot); }
 load() { return structuredClone(this.value); }
 save(value) { this.value=structuredClone(value); }
}
