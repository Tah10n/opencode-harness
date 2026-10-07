export class MemoryStorage {
 constructor(snapshot={revision:0,products:[]}) { this.snapshot=structuredClone(snapshot); }
 read() { return structuredClone(this.snapshot); }
 write(snapshot) { this.snapshot=structuredClone(snapshot); }
}
