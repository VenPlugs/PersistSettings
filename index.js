/* PersistFavourites, a powercord plugin to make sure you never lose your favourites again!
 * Copyright (C) 2021 Vendicated
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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

function removeOverlaps(obj1, obj2) {
  const one = Object.keys(obj1).reduce((acc, curr) => {
    if (!obj2.hasOwnProperty(curr)) acc[curr] = obj1[curr];
    return acc;
  }, {});
  const two = Object.keys(obj2).reduce((acc, curr) => {
    if (!obj1.hasOwnProperty(curr)) acc[curr] = obj2[curr];
    return acc;
  }, {});

  return [one, two];
}

module.exports = class PersistFavourites extends Plugin {
  constructor(...args) {
    super(...args);
    this.restore = this.restore.bind(this);
    this.backupGifs = this.backupGifs.bind(this);
    this.backupVoice = this.backupVoice.bind(this);
    this.backupEmotes = this.backupEmotes.bind(this);
    this.backupKeybinds = this.backupKeybinds.bind(this);
    this.backupSettings = this.backupSettings.bind(this);
    this.backupEmotesMaybe = this.backupEmotesMaybe.bind(this);
    this.backupAccessibility = this.backupAccessibility.bind(this);
  }

  async startPlugin() {
    this.gifs = await getModule(["getFavorites", "getRandomFavorite"]);
    this.users = await getModule(["getNullableCurrentUser"]);
    this.accessibility = await getModule(["isZoomedIn"]);
    this.storage = await getModule(["ObjectStorage"]);
    this.emotes = await getModule(["getGuildEmoji"]);
    this.keybinds = await getModule(["hasKeybind"]);
    this.voice = await getModule(["isDeaf"]);

    FluxDispatcher.subscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.subscribe("GIF_FAVORITE_ADD", this.backupGifs);
    FluxDispatcher.subscribe("GIF_FAVORITE_REMOVE", this.backupGifs);
    FluxDispatcher.subscribe("EMOJI_FAVORITE", this.backupEmotes);
    FluxDispatcher.subscribe("EMOJI_UNFAVORITE", this.backupEmotes);
    FluxDispatcher.subscribe("EMOJI_TRACK_USAGE", this.backupEmotes);
    FluxDispatcher.subscribe("KEYBINDS_ADD_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_DELETE_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_ENABLE_ALL_KEYBINDS", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_SET_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("USER_SETTINGS_UPDATE", this.backupSettings);

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
    FluxDispatcher.unsubscribe("KEYBINDS_ADD_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_DELETE_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_ENABLE_ALL_KEYBINDS", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_SET_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("USER_SETTINGS_UPDATE", this.backupSettings);
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

  backupKeybinds() {
    const keybinds = this.keybinds.getState();
    this.settings.set("keybinds", keybinds);
    this.log("Successfully backed up your keybinds!");
  }

  backupAccessibility() {
    const accessibility = this.accessibility.getState();
    this.settings.set("accessibility", accessibility);
    this.log("Successfully backed up your accessibility settings!");
  }

  backupVoice() {
    const voice = this.voice.getState()?.settingsByContext;
    this.settings.set("voice", voice);
    this.log("Successfully backed up your voice & video settings!");
  }

  backupSettings() {
    this.backupVoice();
    this.backupKeybinds();
    this.backupAccessibility();
  }

  backupEmotesMaybe() {
    if (Math.random() > 0.9) this.backupEmotes();
    this.log("Successfully backed up your emotes!");
  }

  async backupEmotes() {
    const emotes = this.emotes.getState();
    this.settings.set(await this.getEmojiKey(), emotes);
    this.log("Successfully backed up your emotes!");
  }

  restore() {
    this.didRestore = true;
    this.restoreGifs();
    this.restoreVoice();
    this.restoreEmotes();
    this.restoreKeybinds();
    this.restoreAccessibility();
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

  restoreKeybinds() {
    const backup = this.settings.get("keybinds", null);
    if (!backup) return void this.backupKeybinds();

    const store = {
      _version: 2,
      _state: backup
    };

    this.storage.impl.set("keybinds", store);
    this.keybinds.initialize(store._state);
    this.log("Successfully restored your keybinds!");
  }

  restoreVoice() {
    const backup = this.settings.get("voice", null);
    if (!backup) return void this.backupVoice();

    this.storage.impl.set("MediaEngineStore", backup);
    this.voice.initialize(backup);
    this.log("Successfully restored your voice & video settings!");
  }

  restoreAccessibility() {
    const backup = this.settings.get("accessibility", null);
    if (!backup) return void this.backupAccessibility();

    const store = {
      _version: 7,
      _state: backup
    };

    this.storage.impl.set("AccessibilityStore", store);
    this.accessibility.initialize(store._state);
    this.log("Successfully restored your accessibility settings!");
  }
};
