export type MenuSoundRole = 'menuOpen' | 'menuItem';

export interface MenuSoundOption {
  id: string;
  label: string;
  kind: 'default-open' | 'default-item' | 'file';
  src?: string;
}

export interface MenuSoundSettings {
  menuOpen: string;
  menuItem: string;
  simplifyMenuSounds: boolean;
}

const STORAGE_KEY = 'ai-canvas-menu-sounds';

export const MENU_OPEN_SOUND_OPTIONS: MenuSoundOption[] = [
  { id: 'menu-open-default', label: 'MenuOpenDefault', kind: 'default-open' },
  { id: 'game-ui', label: 'Game UI', kind: 'file', src: '/sounds/Game UI.mp3' },
  { id: 'mouse-click', label: 'Mouse Click', kind: 'file', src: '/sounds/Mouse Click.mp3' },
  { id: 'tech-gadget', label: 'Tech Gadget', kind: 'file', src: '/sounds/Tech Gadget.mp3' },
  { id: 'tok', label: 'Tok', kind: 'file', src: '/sounds/Tok.mp3' }
];

export const MENU_ITEM_SOUND_OPTIONS: MenuSoundOption[] = [
  { id: 'menu-item-default', label: 'MenuItemDefault', kind: 'default-item' },
  { id: 'game-ui', label: 'Game UI', kind: 'file', src: '/sounds/Game UI.mp3' },
  { id: 'mouse-click', label: 'Mouse Click', kind: 'file', src: '/sounds/Mouse Click.mp3' },
  { id: 'tech-gadget', label: 'Tech Gadget', kind: 'file', src: '/sounds/Tech Gadget.mp3' },
  { id: 'tok', label: 'Tok', kind: 'file', src: '/sounds/Tok.mp3' }
];

const DEFAULT_SETTINGS: MenuSoundSettings = {
  menuOpen: 'menu-open-default',
  menuItem: 'menu-item-default',
  simplifyMenuSounds: false
};

const isValidOption = (role: MenuSoundRole, value: string) => {
  const options = role === 'menuOpen' ? MENU_OPEN_SOUND_OPTIONS : MENU_ITEM_SOUND_OPTIONS;
  return options.some(option => option.id === value);
};

export const getMenuSoundSettings = (): MenuSoundSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw);
    const menuOpen = isValidOption('menuOpen', parsed?.menuOpen) ? parsed.menuOpen : DEFAULT_SETTINGS.menuOpen;
    const menuItem = isValidOption('menuItem', parsed?.menuItem) ? parsed.menuItem : DEFAULT_SETTINGS.menuItem;
    return {
      menuOpen,
      menuItem,
      simplifyMenuSounds: parsed?.simplifyMenuSounds === true
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const setMenuSoundSetting = (role: MenuSoundRole, value: string) => {
  const safeValue = isValidOption(role, value)
    ? value
    : role === 'menuOpen'
      ? DEFAULT_SETTINGS.menuOpen
      : DEFAULT_SETTINGS.menuItem;

  const next = {
    ...getMenuSoundSettings(),
    [role]: safeValue
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('menu-sound-settings-changed', { detail: next }));
};

export const setMenuSoundToggle = (key: 'simplifyMenuSounds', value: boolean) => {
  const next = {
    ...getMenuSoundSettings(),
    [key]: value
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('menu-sound-settings-changed', { detail: next }));
};

export const findMenuSoundOption = (role: MenuSoundRole, id: string): MenuSoundOption => {
  const options = role === 'menuOpen' ? MENU_OPEN_SOUND_OPTIONS : MENU_ITEM_SOUND_OPTIONS;
  return options.find(option => option.id === id) || options[0];
};
