/**
 * Inline 24px stroke icons — keeps the bundle free of an icon dependency and
 * lets every glyph inherit `currentColor`.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const make = (paths) =>
  function Icon(props) {
    return (
      <svg {...base} {...props}>
        {paths}
      </svg>
    );
  };

export const CartIcon = make(
  <>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M2 3h2.2l2.3 12.2a1.8 1.8 0 0 0 1.8 1.4h8.9a1.8 1.8 0 0 0 1.8-1.4L21 7H5" />
  </>,
);

export const HeartIcon = make(
  <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20z" />,
);

export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </>,
);

export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </>,
);

export const MenuIcon = make(<path d="M3 6h18M3 12h18M3 18h18" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />);
export const ChevronRight = make(<path d="m9 5 7 7-7 7" />);
export const ChevronLeft = make(<path d="m15 5-7 7 7 7" />);
export const ChevronDown = make(<path d="m5 9 7 7 7-7" />);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = make(<path d="M5 12h14" />);
export const TrashIcon = make(
  <>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7 7.5 20a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9L17.5 7" />
  </>,
);
export const CheckIcon = make(<path d="m4.5 12.5 5 5 10-11" />);
export const CheckCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.6 2.6L16 9.5" />
  </>,
);
export const TruckIcon = make(
  <>
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17.5" cy="18" r="1.6" />
  </>,
);
export const PackageIcon = make(
  <>
    <path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </>,
);
export const ShieldIcon = make(<path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />);
export const LeafIcon = make(
  <>
    <path d="M4 20c0-8 6-14 16-14 0 10-6 14-13 14H4z" />
    <path d="M9 15c2-3 5-5 8-6" />
  </>,
);
export const StarIcon = (props) => (
  <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
    <path
      d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      fill="currentColor"
    />
  </svg>
);
export const DashboardIcon = make(
  <>
    <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
    <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" />
  </>,
);
export const TagIcon = make(
  <>
    <path d="M3 12.5V4a1 1 0 0 1 1-1h8.5L21 11.5 12.5 20z" />
    <circle cx="7.5" cy="7.5" r="1.3" />
  </>,
);
export const UsersIcon = make(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 19a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.5 19a6.6 6.6 0 0 0-1.6-4.3" />
  </>,
);
export const SettingsIcon = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.7 15H3.4a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.7 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1A1.6 1.6 0 0 0 10.4 4.2V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.4 1h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
  </>,
);
export const LogoutIcon = make(
  <>
    <path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
    <path d="M16 15l4-3-4-3M20 12H10" />
  </>,
);
export const RefreshIcon = make(
  <>
    <path d="M20 11a8 8 0 0 0-13.7-5L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 13.7 5L20 16" />
    <path d="M20 20v-4h-4" />
  </>,
);
export const DownloadIcon = make(
  <>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M4 19h16" />
  </>,
);
export const FilterIcon = make(<path d="M3 5h18l-7 8v6l-4 2v-8z" />);
export const AlertIcon = make(
  <>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4.5M12 17.4v.1" />
  </>,
);
export const ImageIcon = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 5-5 4 4 3-2.5 4 3.5" />
  </>,
);
export const CopyIcon = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>,
);
export const EditIcon = make(
  <>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="m15 6 3 3" />
  </>,
);
export const RupeeIcon = make(<path d="M7 4h10M7 8h10M16 4c0 4-3.5 5-7 5l7 10" />);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </>,
);
export const MailIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </>,
);
export const PhoneIcon = make(
  <path d="M6 3h3l1.6 4-2 1.4a12 12 0 0 0 5.9 5.9l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4z" />,
);
export const MapPinIcon = make(
  <>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </>,
);
