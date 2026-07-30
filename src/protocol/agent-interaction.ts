import {
  ParseError,
  Token,
  parseDictionary,
  type Dictionary,
  type Item
} from "structured-headers";

export type DeclarationClassification =
  | "valid"
  | "missing"
  | "invalid"
  | "unsupported";

export type InteractionMode = "autonomous" | "unspecified";

export type DeclarationReasonCode =
  | "syntax_error"
  | "missing_member"
  | "unknown_member"
  | "unsupported_actor"
  | "unsupported_mode"
  | "unsupported_version"
  | "duplicate_declaration";

export interface DeclarationResult {
  readonly classification: DeclarationClassification;
  readonly mode: InteractionMode;
  readonly profileVersion?: number;
  readonly reasonCode?: DeclarationReasonCode;
}

export type HeaderFields = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

const requiredMembers = ["actor", "mode", "version"] as const;

function invalid(
  reasonCode: DeclarationReasonCode,
  profileVersion?: number
): DeclarationResult {
  return {
    classification: "invalid",
    mode: "unspecified",
    reasonCode,
    ...(profileVersion === undefined ? {} : { profileVersion })
  };
}

function dictionaryMemberKeys(input: string): string[] {
  const keys: string[] = [];
  let memberStart = 0;
  let innerListDepth = 0;
  let quoted = false;
  let escaped = false;

  const recordKey = (end: number): void => {
    const member = input.slice(memberStart, end).trimStart();
    const match = /^([a-z*][a-z0-9_.*-]*)/.exec(member);
    if (match !== null) {
      keys.push(match[1]);
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === "(") {
      innerListDepth += 1;
    } else if (character === ")" && innerListDepth > 0) {
      innerListDepth -= 1;
    } else if (character === "," && innerListDepth === 0) {
      recordKey(index);
      memberStart = index + 1;
    }
  }

  recordKey(input.length);
  return keys;
}

function hasDuplicateDictionaryMember(input: string): boolean {
  const seen = new Set<string>();
  for (const key of dictionaryMemberKeys(input)) {
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function asUnparameterizedItem(
  dictionary: Dictionary,
  key: string
): Item | undefined {
  const member = dictionary.get(key);
  if (
    member === undefined ||
    !Array.isArray(member) ||
    !(member[1] instanceof Map) ||
    member[1].size > 0 ||
    Array.isArray(member[0])
  ) {
    return undefined;
  }
  return member as Item;
}

function tokenValue(item: Item | undefined): string | undefined {
  return item?.[0] instanceof Token ? item[0].toString() : undefined;
}

function resolveHeader(
  headers: HeaderFields
): string | DeclarationResult | undefined {
  const matches = Object.entries(headers).filter(
    ([name, value]) =>
      name.toLowerCase() === "agent-interaction" && value !== undefined
  );

  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length > 1) {
    return invalid("duplicate_declaration");
  }

  const value = matches[0][1];
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      return invalid("duplicate_declaration");
    }
    return value[0];
  }
  return value as string;
}

export function classifyAgentInteraction(
  headers: HeaderFields
): DeclarationResult {
  const resolved = resolveHeader(headers);

  if (resolved === undefined) {
    return { classification: "missing", mode: "unspecified" };
  }
  if (typeof resolved !== "string") {
    return resolved;
  }
  if (hasDuplicateDictionaryMember(resolved)) {
    return invalid("duplicate_declaration");
  }

  let dictionary: Dictionary;
  try {
    dictionary = parseDictionary(resolved);
  } catch (error) {
    if (error instanceof ParseError || error instanceof Error) {
      return invalid("syntax_error");
    }
    return invalid("syntax_error");
  }

  if (dictionary.size === 0) {
    return invalid("missing_member");
  }
  const versionMember = asUnparameterizedItem(dictionary, "version");
  const knownVersion =
    versionMember !== undefined &&
    typeof versionMember[0] === "number" &&
    Number.isInteger(versionMember[0])
      ? versionMember[0]
      : undefined;
  if ([...dictionary.keys()].some((key) => !requiredMembers.includes(key as never))) {
    return invalid("unknown_member", knownVersion);
  }
  if (
    [...dictionary.values()].some(
      (member) => Array.isArray(member[0]) || member[1].size > 0
    )
  ) {
    return invalid("unknown_member", knownVersion);
  }
  if (requiredMembers.some((key) => !dictionary.has(key))) {
    return invalid("missing_member", knownVersion);
  }

  const actor = asUnparameterizedItem(dictionary, "actor");
  const mode = asUnparameterizedItem(dictionary, "mode");
  const version = versionMember;

  if (actor === undefined || tokenValue(actor) !== "agent") {
    return invalid("unsupported_actor", knownVersion);
  }
  if (mode === undefined || tokenValue(mode) !== "autonomous") {
    return invalid("unsupported_mode", knownVersion);
  }
  if (
    version === undefined ||
    typeof version[0] !== "number" ||
    !Number.isInteger(version[0])
  ) {
    return invalid("unsupported_version");
  }
  if (version[0] !== 1) {
    return {
      classification: "unsupported",
      mode: "unspecified",
      profileVersion: version[0],
      reasonCode: "unsupported_version"
    };
  }

  return {
    classification: "valid",
    mode: "autonomous",
    profileVersion: 1
  };
}
