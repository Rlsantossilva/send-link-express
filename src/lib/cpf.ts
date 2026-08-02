export const CPF_LOGIN_DOMAIN = "cpf.zaptri.app";

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function cpfLoginEmail(cpf: string) {
  return `${onlyDigits(cpf)}@${CPF_LOGIN_DOMAIN}`;
}

export function formatCpf(cpf: string) {
  const digits = onlyDigits(cpf).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
