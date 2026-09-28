// Tiny inline-SVG icon components, all built on the same base <Icon>.

export function Icon({ path, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: path }} />;
}
export const IconPlus = (p) => <Icon {...p} path='<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' />;
export const IconTrash = (p) => <Icon {...p} path='<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' />;
export const IconEdit = (p) => <Icon {...p} path='<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' />;
export const IconDownload = (p) => <Icon {...p} path='<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' />;
export const IconSearch = (p) => <Icon {...p} path='<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' />;
export const IconClose = (p) => <Icon {...p} size={16} path='<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' />;
export const IconAlert = (p) => <Icon {...p} size={12} path='<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' />;
export const IconGrid = (p) => <Icon {...p} path='<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' />;
export const IconCar = (p) => <Icon {...p} path='<path d="M5 17h14M5 17a2 2 0 0 1-2-2v-3l2-5h10l2 5v3a2 2 0 0 1-2 2M5 17v2M19 17v2"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>' />;
export const IconKey = (p) => <Icon {...p} path='<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4M16 8l3 3M18 6l2 2"/>' />;
export const IconUsers = (p) => <Icon {...p} path='<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' />;
export const IconReceipt = (p) => <Icon {...p} path='<path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/>' />;
export const IconWallet = (p) => <Icon {...p} path='<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>' />;
export const IconChevron = (p) => <Icon {...p} size={13} path='<polyline points="6 9 12 15 18 9"/>' />;
export const IconSun = (p) => <Icon {...p} path='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>' />;
export const IconMoon = (p) => <Icon {...p} path='<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>' />;
export const IconUpload = (p) => <Icon {...p} path='<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>' />;
export const IconEye = (p) => <Icon {...p} path='<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>' />;
export const IconLock = (p) => <Icon {...p} path='<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' />;
export const IconCamera = (p) => <Icon {...p} path='<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>' />;
