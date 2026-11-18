/** A message with plural forms, chosen with Intl.PluralRules. `other` is always required. */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Leaf = string | Plural;

/** The same shape as the English messages, with any wording. Used to type the other languages. */
export type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends { other: string } ? Plural : Shape<T[K]>;
};

/** Every key path ("setup.plans.title") of a message tree. */
export type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends Leaf
    ? T[K] extends { other: string } | string
      ? `${P}${K}`
      : never
    : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
