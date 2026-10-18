export function OpenCodeLogo(props: { class?: string }) {
  return (
    <svg
      data-component="opencode-logo"
      aria-hidden="true"
      class={props.class}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(1.2 1.2) scale(0.85)">
        <path opacity="0.2" d="M12 16H4V10H12V16Z" fill="currentColor" />
        <path d="M4 16H0V0H4V16ZM16 16H12V0H16V16ZM12 10H4V6H12V10Z" fill="currentColor" />
      </g>
    </svg>
  )
}
