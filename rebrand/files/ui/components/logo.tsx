import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 8H4V0H12V8ZM12 20H4V12H12V20Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M4 20H0V0H4V20ZM16 20H12V0H16V20ZM12 12H4V8H12V12Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 40H20V0H60V40ZM60 100H20V60H60V100Z" fill="var(--icon-weak-base)" />
      <path d="M20 100H0V0H20V100ZM80 100H60V0H80V100ZM60 60H20V40H60V60Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M18 18H6V6H18V18ZM18 36H6V24H18V36Z" fill="var(--icon-weak-base)" />
        <path d="M48 18H36V6H48V18Z" fill="var(--icon-weak-base)" />
        <path d="M78 18H66V12H78V18Z" fill="var(--icon-weak-base)" />
        <path d="M114 18H96V12H114V18ZM114 30H96V24H114V30Z" fill="var(--icon-weak-base)" />
        <path d="M138 18H126V12H138V18ZM138 36H126V24H138V36Z" fill="var(--icon-weak-base)" />
        <path d="M198 18H186V12H198V18ZM198 36H186V24H198V36Z" fill="var(--icon-weak-base)" />
        <path d="M216 30H210V12H216V30ZM234 30H228V12H234V30Z" fill="var(--icon-weak-base)" />
        <path d="M6 36H0V6H6V36ZM24 36H18V6H24V36ZM24 24H0V18H24V24Z" fill="var(--icon-base)" />
        <path d="M36 18H30V6H36V18ZM54 18H48V6H54V18ZM54 24H30V18H54V24ZM48 36H36V24H48V36Z" fill="var(--icon-base)" />
        <path d="M84 12H60V6H84V12ZM66 36H60V12H66V36ZM84 24H78V12H84V24ZM84 24H60V18H84V24Z" fill="var(--icon-base)" />
        <path d="M114 12H90V6H114V12ZM96 36H90V12H96V36ZM108 24H90V18H108V24ZM114 36H90V30H114V36Z" fill="var(--icon-base)" />
        <path d="M144 12H120V6H144V12ZM126 36H120V12H126V36ZM144 24H138V12H144V24ZM144 24H120V18H144V24ZM144 36H138V24H144V36Z" fill="var(--icon-base)" />
        <path d="M204 12H180V6H204V12ZM186 36H180V12H186V36ZM204 36H198V12H204V36ZM204 24H180V18H204V24Z" fill="var(--icon-base)" />
        <path d="M234 12H210V6H234V12ZM228 30H216V12H228V30ZM234 36H210V30H234V36Z" fill="var(--icon-base)" />
      </g>
    </svg>
  )
}
