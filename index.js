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

    this.restore();
  }

  pluginWillUnload() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.unsubscribe("GIF_FAVORITE_ADD", this.backupGifs);
    FluxDispatcher.unsubscribe("GIF_FAVORITE_REMOVE", this.backupGifs);
    FluxDispatcher.unsubscribe("EMOJI_FAVORITE", this.backupEmotes);
    FluxDispatcher.unsubscribe("EMOJI_UNFAVORITE", this.backupEmotes);
    FluxDispatcher.unsubscribe("EMOJI_TRACK_USAGE", this.backupEmotesMaybe);
  }

  get emojiKey() {
    return `emotes-${this.users.getCurrentUser().id}`;
  }

  backupGifs() {
    const favs = this.gifs.getFavorites();
    this.settings.set("gifs", favs);
  }

  backupEmotesMaybe() {
    if (Math.random() > 0.9) this.backupEmotes();
  }

  backupEmotes() {
    const emotes = this.emotes.getState();
    this.settings.set(this.emojiKey, emotes);
  }

  restore() {
    this.restoreEmotes();
    this.restoreGifs();
  }

  restoreEmotes() {
    const emotes = this.emotes.getState();
    if (emotes.favorites.length || emotes.usageHistory.length) return;

    const backup = this.settings.get(this.emojiKey, null);
    if (!backup) return;

    const store = {
      _version: 1,
      _state: backup
    };

    this.storage.impl.set("EmojiStore", store);
    this.emotes.initialize(store._state);
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
  }
};
