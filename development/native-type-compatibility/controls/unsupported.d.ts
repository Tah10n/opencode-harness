export default class Shapes {
  overloaded(key: string): () => void;
  overloaded(key: number): () => void;
  generic(): <T>(value: T) => T extends string ? string : number;
}
