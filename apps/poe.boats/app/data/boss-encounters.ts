// Entry quantities and baseline drop rates from Perandus Ledger's public encounter catalog.
// https://xddbsns.com/js/boss-config.js (retrieved 2026-11-27)
export const BOSS_RATES = { source: "https://xddbsns.com/boss-profit.html", capturedOn: "2026-11-27" };

export type BossItem = readonly [
    name: string,
    amount: number,
    market?: "gem" | "unidentified" | "unpriced",
];

export interface BossEncounter {
    name: string;
    entries: readonly BossItem[];
    drops?: readonly BossItem[];
    extraDrops?: readonly BossItem[];
    quantityBonus?: number;
    gemPool?: { chance: number; weights: readonly BossItem[] };
}

export const BOSS_ENCOUNTERS = {
    shaper: {
        name: "Shaper",
        entries: [
            ["Fragment of the Hydra", 1],
            ["Fragment of the Phoenix", 1],
            ["Fragment of the Chimera", 1],
            ["Fragment of the Minotaur", 1],
        ],
        drops: [
            ["Fragment of Shape", 50],
            ["Fragment of Knowledge", 50],
            ["Shaper's Touch", 55],
            ["Voidwalker", 32],
            ["Solstice Vigil", 11],
            ["Dying Sun", 2],
        ],
        extraDrops: [
            ["Shaper's Exalted Orb", 12],
            ["Orb of Dominance", 3],
            ["Voidstorm Support", 10, "gem"],
        ],
    },
    "uber-shaper": {
        name: "Uber Shaper",
        entries: [
            ["Cosmic Fragment", 4],
        ],
        drops: [
            ["Fragment of Shape", 50],
            ["Fragment of Knowledge", 50],
            ["Echoes of Creation", 33],
            ["Entropic Devastation", 30],
            ["The Tides of Time", 18],
            ["The Unblinking Eye", 17],
            ["Starforge", 2],
        ],
        extraDrops: [
            ["Sublime Vision", 2, "unidentified"],
            ["Cosmic Reliquary Key", 1],
            ["Shaper's Exalted Orb", 12],
            ["Orb of Dominance", 3],
            ["Voidstorm Support", 10, "gem"],
        ],
    },
    elder: {
        name: "Elder",
        entries: [
            ["Fragment of Purification", 1],
            ["Fragment of Constriction", 1],
            ["Fragment of Enslavement", 1],
            ["Fragment of Eradication", 1],
        ],
        drops: [
            ["Fragment of Terror", 50],
            ["Fragment of Emptiness", 50],
            ["Cyclopean Coil", 30],
            ["Blasphemer's Grasp", 30],
            ["Nebuloch", 10],
            ["Hopeshredder", 10],
            ["Shimmeron", 10],
            ["Impresence", 10],
        ],
        extraDrops: [
            ["Unidentified Watcher's Eye (2-mod)", 40, "unpriced"],
            ["Elder's Exalted Orb", 10],
            ["Orb of Dominance", 2],
            ["Void of the Elements", 1],
            ["Eldritch Blasphemy Support", 8, "gem"],
        ],
    },
    "uber-elder": {
        name: "Uber Elder",
        entries: [
            ["Fragment of Knowledge", 1],
            ["Fragment of Shape", 1],
            ["Fragment of Terror", 1],
            ["Fragment of Emptiness", 1],
        ],
        drops: [
            ["Mark of the Shaper", 35],
            ["Mark of the Elder", 35],
            ["Voidfletcher", 20],
            ["Indigon", 8],
            ["Disintegrator", 2],
        ],
        extraDrops: [
            ["Unidentified Watcher's Eye (3-mod)", 30, "unpriced"],
            ["Shaper's Exalted Orb", 13],
            ["Elder's Exalted Orb", 13],
            ["Orb of Dominance", 6],
            ["Void of the Elements", 1],
            ["Auspicious Ambitions", 1],
            ["Void Shockwave Support", 10, "gem"],
        ],
    },
    "uber-uber-elder": {
        name: "Uber Uber Elder",
        entries: [
            ["Decaying Fragment", 4],
        ],
        drops: [
            ["Call of the Void", 46],
            ["The Devourer of Minds", 28.5],
            ["Impresence", 10],
            ["Soul Ascension", 9],
            ["The Eternity Shroud", 5],
            ["Voidforge", 1.5],
        ],
        extraDrops: [
            ["Sublime Vision", 1.5, "unidentified"],
            ["Unidentified Watcher's Eye (3-mod)", 30, "unpriced"],
            ["Decaying Reliquary Key", 1.5],
            ["Curio of Decay", 5],
            ["Shaper's Exalted Orb", 13],
            ["Elder's Exalted Orb", 13],
            ["Orb of Dominance", 6],
            ["Void of the Elements", 1],
            ["Auspicious Ambitions", 1],
            ["Void Shockwave Support", 10, "gem"],
        ],
    },
    sirus: {
        name: "Sirus",
        entries: [
            ["Al-Hezmin's Crest", 1],
            ["Baran's Crest", 1],
            ["Drox's Crest", 1],
            ["Veritania's Crest", 1],
        ],
        drops: [
            ["Hands of the High Templar", 40],
            ["Crown of the Inward Eye", 35],
            ["The Burden of Truth", 20],
            ["Unidentified Thread of Hope", 5, "unpriced"],
        ],
        extraDrops: [
            ["Awakener's Orb", 20],
            ["Orb of Dominance", 5],
            ["A Fate Worse Than Death", 4],
            ["Annihilation Support", 10, "gem"],
        ],
    },
    "uber-sirus": {
        name: "Uber Sirus",
        entries: [
            ["Awakening Fragment", 4],
        ],
        drops: [
            ["Unidentified Thread of Hope (Massive)", 46, "unpriced"],
            ["Zana's Ingenuity", 17, "unidentified"],
            ["The Tempest Rising", 28],
            ["Oriath's End", 8],
            ["The Saviour", 1],
        ],
        extraDrops: [
            ["Awakener's Orb", 20],
            ["Orb of Dominance", 5],
            ["Oubliette Reliquary Key", 1],
            ["A Fate Worse Than Death", 4],
            ["Annihilation Support", 5, "gem"],
        ],
    },
    cortex: {
        name: "Cortex",
        entries: [
            ["Cortex", 1],
        ],
        drops: [
            ["Offering to the Serpent", 45],
            ["Perepiteia", 35],
            ["Garb of the Ephemeral", 15],
            ["Bottled Faith", 5],
        ],
        extraDrops: [
            ["Greater Kinetic Instability Support", 10, "gem"],
        ],
    },
    "uber-cortex": {
        name: "Uber Cortex",
        entries: [
            ["Synthesising Fragment", 4],
        ],
        drops: [
            ["Nebulis", 40],
            ["Mask of the Tribunal", 30],
            ["The Apostate", 15],
            ["Circle of Ambition", 10],
            ["Rational Doctrine", 5],
        ],
        extraDrops: [
            ["Forgotten Reliquary Key", 1.5],
            ["Greater Kinetic Instability Support", 10, "gem"],
        ],
    },
    "incarnation-of-dread": {
        name: "Incarnation of Dread",
        entries: [
            ["Echo of Reverence", 1],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["Bonemeld", 55],
            ["The Dark Monarch", 35],
            ["Seven Teachings", 8],
            ["Wine of the Prophet", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Unravelling", 33],
            ["Congregation Support", 2, "gem"],
        ],
    },
    "uber-incarnation-of-dread": {
        name: "Uber Incarnation of Dread",
        entries: [
            ["Reverent Fragment", 4],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["The Hallowed Monarch", 54],
            ["Whispers of Infinity", 30],
            ["Wellwater Phylactery", 14],
            ["The Golden Charlatan", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Unravelling", 33],
            ["Reverent Reliquary Key", 1],
            ["Congregation Support", 2, "gem"],
        ],
    },
    "incarnation-of-neglect": {
        name: "Incarnation of Neglect",
        entries: [
            ["Echo of Loneliness", 1],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["Betrayal's Sting", 50],
            ["The Arkhon's Tools", 38],
            ["Venarius' Astrolabe", 10],
            ["Legacy of the Rose", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Remembrance", 33],
            ["Monochrome", 3],
            ["Frostmage Support", 5, "gem"],
        ],
    },
    "uber-incarnation-of-neglect": {
        name: "Uber Incarnation of Neglect",
        entries: [
            ["Lonely Fragment", 4],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["Refuge in Isolation", 55],
            ["Bitter Instinct", 30],
            ["Haunting Memories", 13],
            ["Festering Resentment", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Remembrance", 33],
            ["Lonely Reliquary Key", 1],
            ["Monochrome", 3],
            ["Frostmage Support", 5, "gem"],
        ],
    },
    "incarnation-of-fear": {
        name: "Incarnation of Fear",
        entries: [
            ["Echo of Trauma", 1],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["Servant of Decay", 50],
            ["The Unseen Hue", 37],
            ["Enmity's Embrace", 11],
            ["Starcaller", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Intention", 50],
            ["Greater Devour Support", 5, "gem"],
        ],
    },
    "uber-incarnation-of-fear": {
        name: "Uber Incarnation of Fear",
        entries: [
            ["Traumatic Fragment", 4],
        ],
        drops: [
            ["Grasping Astrolabe", 14.29],
            ["Runic Astrolabe", 14.29],
            ["Chaotic Astrolabe", 14.29],
            ["Fungal Astrolabe", 14.29],
            ["Nameless Astrolabe", 14.29],
            ["Timeless Astrolabe", 14.29],
            ["Lightless Astrolabe", 14.26],
            ["The Caged Mammoth", 60],
            ["Coiling Whisper", 36],
            ["Woespike", 2],
            ["Wing of the Wyvern", 2],
        ],
        extraDrops: [
            ["Bound by Destiny", 10, "unidentified"],
            ["Orb of Intention", 50],
            ["Traumatic Reliquary Key", 1],
            ["Greater Devour Support", 6, "gem"],
        ],
    },
    maven: {
        name: "Maven",
        entries: [
            ["The Maven's Writ", 1],
        ],
        drops: [
            ["Legacy of Fury", 44],
            ["Graven's Secret", 16],
            ["Arn's Anguish", 16],
            ["Olesya's Delight", 16],
            ["Doppelgänger Guise", 7],
            ["Echoforge", 1],
        ],
        extraDrops: [
            ["Orb of Conflict", 35],
            ["Invert the Rules Support", 10, "gem"],
        ],
    },
    "uber-maven": {
        name: "Uber Maven",
        entries: [
            ["Reality Fragment", 4],
        ],
        drops: [
            ["Viridi's Veil", 52],
            ["Impossible Escape", 33, "unidentified"],
            ["Grace of the Goddess", 13],
            ["Progenesis", 2],
        ],
        extraDrops: [
            ["Orb of Conflict", 33],
            ["Shiny Reliquary Key", 1],
            ["Curio of Potential", 5],
            ["Invert the Rules Support", 10, "gem"],
            ["Eclipse Support", 2, "gem"],
        ],
        gemPool: {
            chance: 2,
            weights: [
                ["Awakened Empower Support", 1, "gem"],
                ["Awakened Enhance Support", 1, "gem"],
                ["Awakened Enlighten Support", 1, "gem"],
            ],
        },
    },
    "black-star": {
        name: "Black Star",
        entries: [
            ["Polaric Invitation", 1],
        ],
        quantityBonus: 50,
        extraDrops: [
            ["Polaric Devastation", 3],
            ["Sudden Dawn", 3],
            ["The Eternal Struggle", 5],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Grand Eldritch Ember", 12],
            ["Greater Eldritch Ember", 12],
        ],
    },
    "searing-exarch": {
        name: "Exarch",
        entries: [
            ["Incandescent Invitation", 1],
        ],
        drops: [
            ["Dawnbreaker", 63],
            ["Dawnstrider", 35],
            ["Dissolution of the Flesh", 2],
        ],
        quantityBonus: 70,
        extraDrops: [
            ["Unidentified Forbidden Flame (ilvl 86-)", 5, "unpriced"],
            ["Exceptional Eldritch Ember", 15],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Overheat Support", 5, "gem"],
        ],
    },
    "eater-of-worlds": {
        name: "Eater",
        entries: [
            ["Screaming Invitation", 1],
        ],
        drops: [
            ["Inextricable Fate", 55],
            ["The Gluttonous Tide", 43],
            ["Melding of the Flesh", 2],
        ],
        quantityBonus: 70,
        extraDrops: [
            ["Unidentified Forbidden Flesh (ilvl 86-)", 5, "unpriced"],
            ["Exceptional Eldritch Ichor", 15],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Gluttony Support", 5, "gem"],
        ],
    },
    "uber-searing-exarch": {
        name: "Uber Exarch",
        entries: [
            ["Blazing Fragment", 4],
        ],
        drops: [
            ["The Annihilating Light", 45.5],
            ["Annihilation's Approach", 29],
            ["Crystallised Omniscience", 24],
            ["The Celestial Brace", 1.5],
        ],
        extraDrops: [
            ["Unidentified Forbidden Flame (ilvl 87+)", 5, "unpriced"],
            ["Exceptional Eldritch Ember", 15],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Archive Reliquary Key", 1.5],
            ["Curio of Absorption", 5],
            ["Overheat Support", 8, "gem"],
        ],
    },
    "uber-eater-of-worlds": {
        name: "Uber Eater",
        entries: [
            ["Devouring Fragment", 4],
        ],
        drops: [
            ["Ravenous Passion", 68],
            ["Ashes of the Stars", 30],
            ["Nimis", 2],
        ],
        extraDrops: [
            ["Unidentified Forbidden Flesh (ilvl 87+)", 5, "unpriced"],
            ["Exceptional Eldritch Ichor", 15],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Visceral Reliquary Key", 1],
            ["Curio of Consumption", 5],
            ["Gluttony Support", 5, "gem"],
        ],
    },
    "infinite-hunger": {
        name: "Infinite Hunger",
        entries: [
            ["Writhing Invitation", 1],
        ],
        quantityBonus: 50,
        extraDrops: [
            ["Choking Guilt", 0.5],
            ["Ceaseless Feast", 3],
            ["Black Zenith", 3],
            ["The Eternal Struggle", 5],
            ["Eldritch Orb of Annulment", 5],
            ["Eldritch Chaos Orb", 5],
            ["Eldritch Exalted Orb", 5],
            ["Grand Eldritch Ichor", 12],
            ["Greater Eldritch Ichor", 12],
        ],
    },
    "king-in-the-mists": {
        name: "King in the Mists",
        entries: [
            ["An Audience With The King", 1],
        ],
        drops: [
            ["The Untouched Soul", 40],
            ["Pragmatism", 35],
            ["The Light of Meaning", 20, "unidentified"],
            ["The Burden of Shadows", 5],
        ],
        extraDrops: [
            ["Hextoad Support", 10, "gem"],
            ["Hexpass Support", 10, "gem"],
        ],
    },
    mastermind: {
        name: "Catarina",
        entries: [
            ["Syndicate Medallion", 1],
        ],
        drops: [
            ["Allflame Ember of Propagation", 33.34],
            ["Allflame Ember of Kulemak", 33.33],
            ["Allflame Ember of the Ethereal", 33.33],
            ["Veiled Cinderswallow Urn (Life)", 10, "unpriced"],
            ["Veiled Cinderswallow Urn (ES)", 10, "unpriced"],
            ["Veiled Cinderswallow Urn (Mana)", 10, "unpriced"],
            ["Veiled Spinehail", 20, "unpriced"],
            ["Veiled Devouring Diadem", 16, "unpriced"],
            ["Veiled Bitterbind Point", 10, "unpriced"],
            ["Veiled Queen's Hunger", 6, "unpriced"],
            ["Veiled Cane of Kulemak (1P2S)", 8.5, "unpriced"],
            ["Veiled Cane of Kulemak (2P1S)", 8.5, "unpriced"],
            ["Veiled Cane of Kulemak (4 mod)", 1, "unpriced"],
        ],
        extraDrops: [
            ["Zorath's Eye of the Endless", 50],
            ["Veiled Exalted Orb", 25],
            ["Nook's Crown", 0.5],
            ["Communion Support", 8, "gem"],
        ],
    },
    oshabi: {
        name: "Oshabi",
        entries: [
            ["Sacred Blossom", 1],
        ],
        drops: [
            ["Forbidden Shako", 52, "unidentified"],
            ["Law of the Wilds", 20],
            ["Witchhunter's Judgment", 16],
            ["Abhorrent Interrogation", 12],
        ],
        extraDrops: [
            ["Sacred Crystallised Lifeforce", 100],
            ["The Aspirant", 10],
            ["Pacifism Support", 12, "gem"],
            ["Greater Unleash Support", 4, "gem"],
        ],
    },
    zorath: {
        name: "Zorath",
        entries: [
            ["Zorath's Eye of Malevolence", 1],
            ["Zorath's Eye of Authority", 1],
            ["Zorath's Eye of the Inevitable", 1],
            ["Zorath's Eye of the Endless", 1],
        ],
        drops: [
            ["Subsume the Source", 40],
            ["Spinesnatch", 20],
            ["Festering Vengeance", 10],
            ["Destructive Aspiration", 10],
            ["Baleful Dominion", 10],
            ["Extinguishing Grasp", 10],
        ],
        extraDrops: [
            ["Crystalfall Support", 13, "gem"],
        ],
    },
    "esh-tul": {
        name: "Esh-Tul",
        entries: [
            ["Hivebrain Gland", 1],
        ],
        drops: [
            ["Foulborn Xoph's Inception", 11.11, "unpriced"],
            ["Foulborn Xoph's Nurture", 2.22, "unpriced"],
            ["Foulborn The Formless Flame", 4.17, "unpriced"],
            ["Foulborn The Formless Inferno", 0.83, "unpriced"],
            ["Foulborn Xoph's Heart", 1.39, "unpriced"],
            ["Foulborn Xoph's Blood", 0.28, "unpriced"],
            ["Foulborn The Red Dream", 1.39, "unpriced"],
            ["Foulborn The Red Nightmare", 0.28, "unpriced"],
            ["Foulborn Tulborn", 11.11, "unpriced"],
            ["Foulborn Tulfall", 2.22, "unpriced"],
            ["Foulborn The Snowblind Grace", 4.17, "unpriced"],
            ["Foulborn The Perfect Form", 0.83, "unpriced"],
            ["Foulborn The Halcyon", 1.39, "unpriced"],
            ["Foulborn The Pandemonius", 0.28, "unpriced"],
            ["Foulborn The Blue Dream", 1.39, "unpriced"],
            ["Foulborn The Blue Nightmare", 0.28, "unpriced"],
            ["Foulborn Hand of Thought and Motion", 11.11, "unpriced"],
            ["Foulborn Hand of Wisdom and Action", 2.22, "unpriced"],
            ["Foulborn Esh's Mirror", 4.17, "unpriced"],
            ["Foulborn Esh's Visage", 0.83, "unpriced"],
            ["Foulborn Voice of the Storm", 1.39, "unpriced"],
            ["Foulborn Choir of the Storm", 0.28, "unpriced"],
            ["Foulborn The Green Dream", 1.39, "unpriced"],
            ["Foulborn The Green Nightmare", 0.28, "unpriced"],
            ["Foulborn Uul-Netol's Kiss", 4.17, "unpriced"],
            ["Foulborn Uul-Netol's Embrace", 0.83, "unpriced"],
            ["Foulborn The Infinite Pursuit", 11.11, "unpriced"],
            ["Foulborn The Red Trail", 2.22, "unpriced"],
            ["Foulborn The Anticipation", 1.39, "unpriced"],
            ["Foulborn The Surrender", 0.28, "unpriced"],
            ["Foulborn Severed in Sleep", 11.11, "unpriced"],
            ["Foulborn United in Dream", 2.22, "unpriced"],
            ["Foulborn Presence of Chayula", 1.67, "unpriced"],
            ["The Will of Xoph", 17],
            ["The Will of Tul", 17],
            ["The Will of Esh", 17],
            ["The Will of Uul-Netol", 10],
            ["Hand of the Lords", 30],
            ["The Grey Wind", 5],
            ["The Sundered Will", 3],
            ["Uul-Netol's Vow", 1],
        ],
        extraDrops: [
            ["Flesh of Xesht", 20],
            ["Something Dark", 10],
            ["Foulgrasp Support", 10, "gem"],
            ["The Escape", 6],
            ["Hiveborn Support", 5, "gem"],
        ],
    },
    atziri: {
        name: "Atziri",
        entries: [
            ["Chronicle (Apex)", 1, "unpriced"],
        ],
        drops: [
            ["Atziri's Promise", 48],
            ["Unidentified Triumvirate Authority (3-mod)", 18, "unpriced"],
            ["Atziri's Step", 15],
            ["Doryani's Invitation", 15],
            ["Doryani's Catalyst", 3],
            ["Pledge of Hands", 0.5],
        ],
    },
    saresh: {
        name: "Saresh",
        entries: [
            ["The Black Barya", 1],
        ],
        drops: [
            ["Screams of the Desiccated", 55, "unidentified"],
            ["The Broken Elegy", 40],
            ["The Sands of Time", 5],
        ],
        extraDrops: [
            ["Transfusion Support", 10, "gem"],
        ],
    },
    "uber-atziri": {
        name: "Uber Atziri",
        entries: [
            ["Chronicle (Cradle)", 1, "unpriced"],
        ],
        drops: [
            ["The Vertex", 42],
            ["Atziri's Splendour", 39],
            ["Unidentified Triumvirate Authority (4-mod)", 6, "unpriced"],
            ["Atziri's Acuity", 6],
            ["Atziri's Reflection", 3],
            ["Atziri's Rule", 3],
            ["Atziri's Disfavour", 1],
        ],
        extraDrops: [
            ["Beauty", 12.5],
            ["Greater Spell Echo Support", 5, "gem"],
            ["Vaal Sacrifice Support", 10, "gem"],
        ],
    },
    mora: {
        name: "Mora, The Coven Queen",
        entries: [
            ["Cursed Poppet", 1],
        ],
        drops: [
            ["Coven Queen's Crown (2-mod)", 82, "unpriced"],
            ["Coven Queen's Crown (3-mod)", 18, "unpriced"],
            ["Bane of the Apostate", 72],
            ["Veil of Flesh", 18],
            ["The Covetous Dark", 10],
        ],
    },
} satisfies Record<string, BossEncounter>;

export type BossId = keyof typeof BOSS_ENCOUNTERS;
