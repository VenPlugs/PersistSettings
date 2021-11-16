/* PersistSettings, a powercord plugin to make sure you never lose your favourites again!
 * Copyright (C) 2021 Vendicated
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const { Plugin } = require("powercord/entities");
const { getModule, FluxDispatcher } = require("powercord/webpack");

const AccessiblityEvents = [
  "ACCESSIBILITY_SET_ZOOM",
  "ACCESSIBILITY_SET_MESSAGE_GROUP_SPACING",
  "ACCESSIBILITY_SET_FONT_SIZE",
  "ACCESSIBILITY_DARK_SIDEBAR_TOGGLE",
  "ACCESSIBILITY_SET_PREFERS_REDUCED_MOTION"
];

const VoiceEvents = [
  "AUDIO_SET_MODE",
  "AUDIO_SET_NOISE_SUPPRESSION",
  "AUDIO_SET_AUTOMATIC_GAIN_CONTROL",
  "AUDIO_SET_ECHO_CANCELLATION",
  "MEDIA_ENGINE_SET_HARDWARE_H264",
  "MEDIA_ENGINE_SET_OPEN_H264",
  "AUDIO_SET_QOS",
  "AUDIO_SET_ATTENUATION",
  "AUDIO_SET_DISPLAY_SILENCE_WARNING",
  "MEDIA_ENGINE_SET_AEC_DUMP",
  "MEDIA_ENGINE_SET_VIDEO_DEVICE",
  "AUDIO_SET_OUTPUT_DEVICE",
  "AUDIO_SET_INPUT_DEVICE",
  "AUDIO_SET_OUTPUT_VOLUME"
];

module.exports = class PersistSettings extends Plugin {
  constructor(...args) {
    super(...args);
    this.restore = this.restore.bind(this);
    this.backupVoice = this.backupVoice.bind(this);
    this.backupKeybinds = this.backupKeybinds.bind(this);
    this.backupSettings = this.backupSettings.bind(this);
    this.backupAccessibility = this.backupAccessibility.bind(this);
  }

  async startPlugin() {
    this.accessibility = await getModule(["isZoomedIn"]);
    this.storage = await getModule(["ObjectStorage"]);
    this.keybinds = await getModule(["hasKeybind"]);
    this.voice = await getModule(["isDeaf"]);

    FluxDispatcher.subscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.subscribe("KEYBINDS_ADD_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_DELETE_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_ENABLE_ALL_KEYBINDS", this.backupKeybinds);
    FluxDispatcher.subscribe("KEYBINDS_SET_KEYBIND", this.backupKeybinds);
    FluxDispatcher.subscribe("USER_SETTINGS_UPDATE", this.backupSettings);

    for (const event of AccessiblityEvents) {
      FluxDispatcher.subscribe(event, this.backupAccessibility);
    }

    for (const event of VoiceEvents) {
      FluxDispatcher.subscribe(event, this.backupVoice);
    }

    // Sometimes CONNECTION_OPEN will fire, other times not soooo lets just do this hack teehee
    setTimeout(() => this.didRestore || this.restore(), 1000 * 10);
  }

  pluginWillUnload() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", this.restore);
    FluxDispatcher.unsubscribe("KEYBINDS_ADD_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_DELETE_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_ENABLE_ALL_KEYBINDS", this.backupKeybinds);
    FluxDispatcher.unsubscribe("KEYBINDS_SET_KEYBIND", this.backupKeybinds);
    FluxDispatcher.unsubscribe("USER_SETTINGS_UPDATE", this.backupSettings);

    for (const event of AccessiblityEvents) {
      FluxDispatcher.unsubscribe(event, this.backupAccessibility);
    }

    for (const event of VoiceEvents) {
      FluxDispatcher.unsubscribe(event, this.backupVoice);
    }
  }

  backupKeybinds() {
    const keybinds = this.keybinds.getState();
    this.settings.set("keybinds", keybinds);
  }

  backupAccessibility() {
    const accessibility = this.accessibility.getState();
    this.settings.set("accessibility", accessibility);
  }

  backupVoice() {
    const voice = this.voice.getState()?.settingsByContext;
    this.settings.set("voice", voice);
  }

  backupSettings() {
    this.backupVoice();
    this.backupKeybinds();
    this.backupAccessibility();
  }

  restore() {
    this.didRestore = true;
    this.restoreVoice();
    this.restoreKeybinds();
    this.restoreAccessibility();
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
  }

  restoreVoice() {
    const backup = this.settings.get("voice", null);
    if (!backup) return void this.backupVoice();

    this.storage.impl.set("MediaEngineStore", backup);
    this.voice.initialize(backup);

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
  }
};
