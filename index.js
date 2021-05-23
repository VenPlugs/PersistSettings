const { Plugin } = require("powercord/entities");
const { getModule, FluxDispatcher } = require("powercord/webpack");

function unique(arr, fn) {
  const hist = {};
  const seen = Object.prototype.hasOwnProperty.bind(hist);
  return arr.filter(item => {
    const key = fn?.(item) ?? item;
    return seen(key) ? false : (hist[key] = true);
  });
}

module.exports = class PersistFavourites extends Plugin {
  constructor(...args) {
    super(...args);
    this.restore = this.restore.bind(this);
    this.backupGifs = this.backupGifs.bind(this);
    this.backupEmotes = this.backupEmotes.bind(this);
    this.backupEmotesMaybe = this.backupEmotesMaybe.bind(this);
  }

  async startPlugin() {
    this.storage = await getModule(["ObjectStorage"]);
    this.gifs = await getModule(["getFavorites", "getRandomFavorite"]);
    this.emotes = await getModule(["getGuildEmoji"]);
    this.users = await getModule(["getCurrentUser"]);

    FluxDispatcher.subscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.subscribe("GIF_FAVORITE_ADD", this.backupGifs);
    FluxDispatcher.subscribe("GIF_FAVORITE_REMOVE", this.backupGifs);
    FluxDispatcher.subscribe("EMOJI_FAVORITE", this.backupEmotes);
    FluxDispatcher.subscribe("EMOJI_UNFAVORITE", this.backupEmotes);
    FluxDispatcher.subscribe("EMOJI_TRACK_USAGE", this.backupEmotesMaybe);

    // Sometimes CONNECTION_OPEN will fire, other times not soooo lets just do this hack teehee
    setTimeout(() => this.didRestore || this.restore(), 1000 * 10);
  }

  pluginWillUnload() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.unsubscribe("GIF_FAVORITE_ADD", this.backupGifs);
    FluxDispatcher.unsubscribe("GIF_FAVORITE_REMOVE", this.backupGifs);
    FluxDispatcher.unsubscribe("EMOJI_FAVORITE", this.backupEmotes);
    FluxDispatcher.unsubscribe("EMOJI_UNFAVORITE", this.backupEmotes);
    FluxDispatcher.unsubscribe("EMOJI_TRACK_USAGE", this.backupEmotesMaybe);
  }

  async getEmojiKey() {
    let id;
    do {
      const user = this.users.getCurrentUser();
      if (!user) await new Promise(r => setTimeout(r, 1000));
      else id = user.id;
    } while (!id);
    return `emotes-${id}`;
  }

  backupGifs() {
    const favs = this.gifs.getFavorites();
    this.settings.set("gifs", favs);
    this.log("Successfully backed up your gifs!");
  }

  backupEmotesMaybe() {
    if (Math.random() > 0.9) this.backupEmotes();
  }

  async backupEmotes() {
    const emotes = this.emotes.getState();
    this.settings.set(await this.getEmojiKey(), emotes);
    this.log("Successfully backed up your emotes!");
  }

  restore() {
    this.didRestore = true;
    this.restoreEmotes();
    this.restoreGifs();
  }

  async restoreEmotes() {
    const emotes = this.emotes.getState();
    const backup = this.settings.get(await this.getEmojiKey(), null);

    const restore = () => {
      const store = {
        _version: 1,
        _state: backup
      };

      this.storage.impl.set("EmojiStore", store);
      this.emotes.initialize(store._state);
      this.log("Successfully restored your emotes!");
    };

    if (emotes.favorites.length || emotes.usageHistory.length) {
      if (!backup) return void this.backupEmotes();

      if (
        !(backup.favorites.length >= emotes.favorites.length && emotes.favorites.every(f => backup.favorites.includes(f))) ||
        !Object.keys(emotes.usageHistory).every(k => backup.usageHistory.hasOwnProperty(k))
      ) {
        return void powercord.api.notices.sendToast("persist-favourites-" + Math.random().toString(16), {
          header: "PersistFavourites",
          content: "Local Emote Data and Backup are in conflict. Please review which one you would like to keep and choose one of the options below.",
          buttons: [
            {
              text: "Restore Backup",
              onClick: () => restore()
            },
            {
              text: "Override Backup",
              onClick: () => void this.backupEmotes()
            }
          ]
        });
      }
    }

    if (backup) restore();
  }

  restoreGifs() {
    const backup = this.settings.get("gifs", null);
    if (!backup) return void this.backupGifs();

    const favorites = unique(backup.concat(this.gifs.getFavorites()), f => f.url);

    const store = {
      _version: 2,
      _state: {
        favorites,
        timesFavorited: favorites.length
      }
    };

    this.storage.impl.set("GIFFavoritesStore", store);
    this.gifs.initialize(store._state);
    this.log("Successfully restored your gifs!");
  }
};
