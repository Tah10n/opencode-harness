export default class Parcel<Owner = { marker: string }> {
  lookup(position: number): { action: (text: string) => number };
}
