export const emptyResonator = {
    ids: [
        "Metadata/Items/Delve/DelveSocketableCurrencyReroll4",
        "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll4",
    ],
    baseType: "Prime Chaotic Resonator",
    action: "delve_currency_reroll",
    variant: "empty-resonator-v1",
    signatureValue: "reroll:4",
} as const;

export function craftingCommoditySignature(identity: { variant?: typeof emptyResonator.variant }) {
    return {
        signatureKind: identity.variant ?? "",
        signatureValue: identity.variant ? emptyResonator.signatureValue : "",
    };
}
