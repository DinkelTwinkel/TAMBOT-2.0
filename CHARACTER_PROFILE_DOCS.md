# Character Profile System Documentation

## Overview
The character profile system allows players to customize their profile with custom images that appear across various bot commands. Profile pictures are stored persistently using Discord as a CDN.

## Commands

### `/character` - Main character management command

#### `/character profilepicture [attachment]`
Upload a custom profile picture that will appear in your stats and other commands.

**Parameters:**
- `image` (required): The image file to upload

**Features:**
- Supported formats: JPG, PNG, GIF, WebP
- Maximum file size: 8MB
- Automatically replaces previous profile picture
- Stores image in designated Discord channel for persistence
- Returns ephemeral success message with preview

#### `/character removeprofile`
Remove your custom profile picture and revert to using your Discord avatar.

**Features:**
- Deletes stored image from storage channel
- Clears database entry
- Confirms removal with ephemeral message

#### `/character view [user]`
View your own or another player's character profile.

**Parameters:**
- `user` (optional): The user whose profile to view (defaults to command user)

**Displays:**
- Profile picture (custom or Discord avatar)
- Profile creation date
- Picture upload date
- Bio (when implemented)

### `/stats [user]` - Stats command integration
The stats command automatically displays the custom profile picture as a thumbnail when available, falling back to Discord avatar if no custom picture is set.

## Configuration

Storage location constants (defined in `character.js`):
```javascript
const PROFILE_STORAGE_GUILD_ID = '1221772148385910835';
const PROFILE_STORAGE_CHANNEL_ID = '1408543899185840250';
```

## Database Schema

### PlayerProfile Collection
```javascript
{
  playerId: String,           // Discord user ID
  profilePicture: {
    url: String,             // CDN URL of the image
    messageId: String,       // Discord message ID in storage channel
    channelId: String,       // Storage channel ID
    guildId: String,         // Storage guild ID
    uploadedAt: Date         // Upload timestamp
  },
  bio: String,               // Player bio (future feature)
  lastUpdated: Date,         // Last modification timestamp
  createdAt: Date,           // Profile creation timestamp
  updatedAt: Date            // Mongoose auto-updated timestamp
}
```

## Technical Implementation

### Image Storage Flow
1. User uploads image via `/character profilepicture`
2. Bot validates file type and size
3. Image is posted to designated storage channel
4. Discord CDN URL is extracted from the posted message
5. URL and metadata are saved to MongoDB
6. Old profile picture message (if exists) is deleted

### Image Retrieval Flow
1. Commands fetch PlayerProfile from MongoDB
2. If profile picture URL exists, use it as thumbnail
3. Otherwise, fall back to user's Discord avatar
4. CDN URLs remain permanent even if user changes Discord avatar

## Security & Validation

- **File Type Validation**: Only accepts image MIME types
- **File Size Limit**: 8MB maximum (Discord standard)
- **User Isolation**: Users can only modify their own profiles
- **Ephemeral Responses**: Sensitive operations use ephemeral messages
- **Automatic Cleanup**: Old images deleted when replaced

## Error Handling

- Graceful fallback to Discord avatar if custom picture unavailable
- Detailed error messages for invalid uploads
- Automatic cleanup attempts for orphaned messages
- Safe database transactions with proper error catching

## Benefits

1. **Persistence**: Images stored in Discord channel act as permanent CDN
2. **Performance**: Direct CDN URLs for fast loading
3. **Flexibility**: Easy to extend with additional profile features
4. **User Experience**: Simple commands with clear feedback
5. **Integration**: Seamlessly works with existing commands like `/stats`

## Future Enhancements

The schema is designed to support future features:
- Player biographies
- Achievement showcases
- Custom badges
- Social features
- Character backstories
- Favorite items display

## Usage Examples

### Setting a Profile Picture
```
/character profilepicture image:[upload your image]
```

### Viewing Your Profile
```
/character view
```

### Viewing Another Player's Profile
```
/character view user:@SomePlayer
```

### Removing Your Profile Picture
```
/character removeprofile
```

### Viewing Stats with Profile Picture
```
/stats
/stats user:@SomePlayer
```

## Maintenance Notes

- Storage channel should not be manually cleared
- Bot automatically manages message lifecycle
- MongoDB indexes ensure fast lookups by player ID
- Consider periodic cleanup of orphaned messages if needed
