export type ModuleRouteOptions = {
  badge?: string;
  detail?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export type ModuleRouteParams = {
  title: string;
  description: string;
} & ModuleRouteOptions;

export type OpenModuleFn = (
  title: string,
  description: string,
  options?: ModuleRouteOptions
) => void;
