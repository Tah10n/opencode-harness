export default class Parcel<Owner = { marker: string }> {
  lookup(position: number): { action: (this: Owner, text: string) => number };
}
