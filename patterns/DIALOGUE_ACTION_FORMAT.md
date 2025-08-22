# Dialogue & Action Formatting Update

## Overview
Fixed the formatting system to properly differentiate between **spoken dialogue** (needs quotes) and **actions/sounds** (no quotes).

## The Problem
Previously, the system either:
- Added quotes to everything (making actions look wrong: `""*scratches balls*""`)
- Removed quotes from everything (making dialogue look wrong: `Keep mining!` instead of `"Keep mining!"`)

## The Solution
The `formatDescription()` function now intelligently detects whether text is:
- **An action** - starts with `*`, `~`, or `-`
- **Dialogue** - everything else

### Formatting Rules:

| Type | Input | Output |
|------|-------|--------|
| **Action** | `*-Scratches Balls.*` | `-Scratches Balls.` |
| **Action** | `*~Yawns*` | `~Yawns` |
| **Sound** | `~sighs deeply` | `~sighs deeply` |
| **Grunt** | `-HUFF` | `-HUFF` |
| **Dialogue** | `Keep mining!` | `"Keep mining!"` |
| **Dialogue** | `The children yearn for the mines...` | `"The children yearn for the mines..."` |
| **Pre-quoted** | `"Already quoted"` | `"Already quoted"` |

## Files Updated

### 1. `shopHandler.js`
Updated `formatDescription()` to:
- Check if text starts with action indicators (`*`, `~`, `-`)
- Return actions without quotes
- Add quotes to dialogue
- Prevent double-quoting

### 2. `generateShop.js`
Same formatting logic applied for consistency

### 3. `aiShopDialogueGenerator.js`
Enhanced AI prompt to generate both dialogue and actions:
- Can say something (dialogue)
- Can perform actions (`*scratches beard*`)
- Can make sounds (`~sighs`)
- Can combine both (`*looks up* Another slow day.`)

## Examples in Practice

### Shop Idle Display:

**Action (no quotes):**
```
~yawns
```

**Dialogue (with quotes):**
```
"The children yearn for the mines..."
```

**Mixed:**
```
*wipes sweat* "Hot day in the mines, eh?"
```

### Shopkeeper Examples:

**Grimsby Coalhand (Coal Mine):**
- Action: `*spits into bucket*`
- Dialogue: `"Another day, another cave-in waiting to happen."`
- Mixed: `*coughs from coal dust* "This stuff'll kill ya, but it pays the bills."`

**Lady Crystalline (Diamond Mine):**
- Action: `*adjusts silk gloves delicately*`
- Dialogue: `"These diamonds are flawless, unlike most of my customers."`
- Sound: `~laughs coldly`

**The Voidkeeper (Adamantite):**
- Action: `*stares with empty eyes*`
- Dialogue: `"The void sees all... purchases included."`
- Mixed: `*whispers* "The Voidkeeper knows what you seek..."`

**Big Martha (Inn):**
- Action: `*wipes down the bar*`
- Dialogue: `"What'll it be, love? The usual?"`
- Sound: `~hums cheerfully`

## Testing

Run the formatting test:
```bash
cd "D:\CODE\TAMBOT 2.0\patterns"
node testFormatting.js
```

This shows how different inputs are formatted.

## The One Pick with Actions

The 5% chance One Pick mentions can now include actions:

**Believer with action:**
> *eyes gleam with fervor* "The One Pick exists, I've seen the signs in the stone patterns!"

**Skeptic with sound:**
> ~snorts derisively "The One Pick? Just another fairy tale for gullible miners."

**Mysterious with mixed:**
> *lowers voice* "Those who seek The One Pick..." *glances around nervously* "...rarely return unchanged."

## Benefits

1. **More Natural:** Actions feel like stage directions, dialogue feels spoken
2. **More Variety:** Shopkeepers can express themselves through actions
3. **Better Immersion:** Mix of actions and dialogue creates scene
4. **Cleaner Display:** No more doubled quotes or missing quotes

## Summary

✅ **Actions appear without quotes:** `~yawns`
✅ **Dialogue appears with quotes:** `"Keep mining!"`
✅ **No double-quoting**
✅ **AI can generate both types**
✅ **Proper presentation in shop embeds**

The shops now feel more alive with shopkeepers who don't just speak, but also perform actions that match their personalities!