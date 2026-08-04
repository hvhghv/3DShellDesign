declare module "s-expression" {
  interface StringLiteral {
    toString(): string;
  }

  type SExpression = string | StringLiteral | SExpression[];

  interface ParseError extends Error {
    line?: number;
    col?: number;
  }

  function parse(input: string): SExpression | ParseError;
  export default parse;
}
