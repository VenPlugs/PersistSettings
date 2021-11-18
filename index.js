/* PersistSettings, a powercord plugin to make sure you never lose your favourites again!
 * Copyright (C) 2021 Vendicated
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const { Plugin } = require('powercord/entities');
const { getModule, FluxDispatcher } = require('powercord/webpack');

const AccessiblityEvents = [
  'ACCESSIBILITY_SET_MESSAGE_GROUP_SPACING',
  'ACCESSIBILITY_SET_PREFERS_REDUCED_MOTION',
  'ACCESSIBILITY_DESATURATE_ROLES_TOGGLE',
  'ACCESSIBILITY_DARK_SIDEBAR_TOGGLE',
  'ACCESSIBILITY_SET_SATURATION',
  'ACCESSIBILITY_SET_FONT_SIZE',
  'ACCESSIBILITY_SET_ZOOM'
];

const VoiceEvents = [
  'AUDIO_SET_DISPLAY_SILENCE_WARNING',
  'AUDIO_SET_AUTOMATIC_GAIN_CONTROL',
  'MEDIA_ENGINE_SET_HARDWARE_H264',
  'MEDIA_ENGINE_SET_VIDEO_DEVICE',
  'AUDIO_SET_NOISE_SUPPRESSION',
  'AUDIO_SET_ECHO_CANCELLATION',
  'MEDIA_ENGINE_SET_OPEN_H264',
  'MEDIA_ENGINE_SET_AEC_DUMP',
  'AUDIO_SET_OUTPUT_VOLUME',
  'AUDIO_SET_OUTPUT_DEVICE',
  'AUDIO_SET_INPUT_DEVICE',
  'AUDIO_SET_ATTENUATION',
  'AUDIO_SET_MODE',
  'AUDIO_SET_QOS'
];

const NotificationEvents = [
  'NOTIFICATIONS_SET_DISABLE_UNREAD_BADGE',
  'NOTIFICATIONS_SET_PERMISSION_STATE',
  'NOTIFICATIONS_SET_DISABLED_SOUNDS',
  'NOTIFICATIONS_SET_TASKBAR_FLASH',
  'NOTIFICATIONS_SET_DESKTOP_TYPE',
  'NOTIFICATIONS_SET_TTS_TYPE'
];

module.exports = class PersistSettings extends Plugin {
  constructor(...args) {
    super(...args);
    this.restore = this.restore.bind(this);
    this.backupVoice = this.backupVoice.bind(this);
    this.backupKeybinds = this.backupKeybinds.bind(this);
    this.backupSettings = this.backupSettings.bind(this);
    this.backupExperiments = this.backupExperiments.bind(this);
    this.backupAccessibility = this.backupAccessibility.bind(this);
    this.backupNotifications = this.backupNotifications.bind(this);
  }

  async startPlugin() {
    this.experiments = await getModule(['hasRegisteredExperiment']);
    this.notifications = await getModule(['getDesktopType']);
    this.accessibility = await getModule(['isZoomedIn']);
    this.storage = await getModule(['ObjectStorage']);
    this.keybinds = await getModule(['hasKeybind']);
    this.voice = await getModule(['isDeaf']);

    FluxDispatcher.subscribe('CONNECTION_OPEN', this.restore);
    FluxDispatcher.subscribe('KEYBINDS_ADD_KEYBIND', this.backupKeybinds);
    FluxDispatcher.subscribe('KEYBINDS_SET_KEYBIND', this.backupKeybinds);
    FluxDispatcher.subscribe('USER_SETTINGS_UPDATE', this.backupSettings);
    FluxDispatcher.subscribe('KEYBINDS_DELETE_KEYBIND', this.backupKeybinds);
    FluxDispatcher.subscribe('KEYBINDS_ENABLE_ALL_KEYBINDS', this.backupKeybinds);
    FluxDispatcher.subscribe('EXPERIMENT_OVERRIDE_BUCKET', this.backupExperiments);

    for (const event of AccessiblityEvents) {
      FluxDispatcher.subscribe(event, this.backupAccessibility);
    }

    for (const event of VoiceEvents) {
      FluxDispatcher.subscribe(event, this.backupVoice);
    }

    for (const event of NotificationEvents) {
      FluxDispatcher.subscribe(event, this.backupNotifications);
    }

    // Sometimes CONNECTION_OPEN will fire, other times not soooo lets just do this hack teehee
    setTimeout(() => this.didRestore || this.restore(), 1000 * 10);
  }

  pluginWillUnload() {
    FluxDispatcher.unsubscribe('CONNECTION_OPEN', this.restore);
    FluxDispatcher.unsubscribe('KEYBINDS_ADD_KEYBIND', this.backupKeybinds);
    FluxDispatcher.unsubscribe('KEYBINDS_SET_KEYBIND', this.backupKeybinds);
    FluxDispatcher.unsubscribe('USER_SETTINGS_UPDATE', this.backupSettings);
    FluxDispatcher.unsubscribe('KEYBINDS_DELETE_KEYBIND', this.backupKeybinds);
    FluxDispatcher.unsubscribe('KEYBINDS_ENABLE_ALL_KEYBINDS', this.backupKeybinds);
    FluxDispatcher.unsubscribe('EXPERIMENT_OVERRIDE_BUCKET', this.backupExperiments);

    for (const event of AccessiblityEvents) {
      FluxDispatcher.unsubscribe(event, this.backupAccessibility);
    }

    for (const event of VoiceEvents) {
      FluxDispatcher.unsubscribe(event, this.backupVoice);
    }

    for (const event of NotificationEvents) {
      FluxDispatcher.unsubscribe(event, this.backupNotifications);
    }
  }

  backupKeybinds() {
    const keybinds = this.keybinds.getState();
    this.settings.set('keybinds', keybinds);
  }

  backupAccessibility() {
    const accessibility = this.accessibility.getState();
    this.settings.set('accessibility', accessibility);
  }

  backupNotifications() {
    const notifications = this.notifications.getState();
    this.settings.set('notifications', notifications);
  }

  backupExperiments() {
    const experiments = this.experiments.getSerializedState()?.experimentOverrides;
    this.settings.set('experiments', experiments);
  }

  backupVoice() {
    const voice = this.voice.getState()?.settingsByContext;
    this.settings.set('voice', voice);
  }

  backupSettings() {
    this.backupVoice();
    this.backupKeybinds();
    this.backupExperiments();
    this.backupAccessibility();
    this.backupNotifications();
  }

  restore() {
    this.didRestore = true;
    this.restoreVoice();
    this.restoreKeybinds();
    this.restoreExperiments();
    this.restoreAccessibility();
    this.restoreNotifications();
  }

  restoreKeybinds() {
    const backup = this.settings.get('keybinds', null);
    if (!backup) return void this.backupKeybinds();

    const store = {
      _version: 2,
      _state: backup
    };

    this.storage.impl.set('keybinds', store);
    this.keybinds.initialize(store._state);
  }

  restoreExperiments() {
    const backup = this.settings.get('experiments', null);
    if (!backup) return void this.backupExperiments();

    // what the fuck discord...? you can't even spell experiments??
    this.storage.impl.set('exerimentOverrides', backup);
    this.experiments.initialize(backup);
  }

  restoreVoice() {
    const backup = this.settings.get('voice', null);
    if (!backup) return void this.backupVoice();

    this.storage.impl.set('MediaEngineStore', backup);
    this.voice.initialize(backup);
  }

  restoreAccessibility() {
    const backup = this.settings.get('accessibility', null);
    if (!backup) return void this.backupAccessibility();

    const store = {
      _version: 7,
      _state: backup
    };

    this.storage.impl.set('AccessibilityStore', store);
    this.accessibility.initialize(store._state);
  }

  restoreNotifications() {
    const backup = this.settings.get('notifications', null);
    if (!backup) return void this.backupNotifications();

    const store = {
      _version: 1,
      _state: backup
    };

    this.storage.impl.set('notifications', store);
    this.notifications.initialize(store._state);
  }
};
