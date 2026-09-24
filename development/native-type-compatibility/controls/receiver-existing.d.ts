export default class Cabinet {
  take(): Array<(this: { marker: string }, count: number) => void>;
}
