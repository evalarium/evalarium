export const serializeDomInPage = (): string => {
  const volatileAttributes = new Set([
    'data-reactid',
    'data-reactroot',
    'data-evalarium-volatile',
    'nonce',
  ]);
  // Component libraries mint per-instance UUIDs into attributes (editor
  // placeholder classes, aria wiring). They are render-timing artifacts no
  // assertion can rely on; record identity stays covered by the a11y
  // snapshot URLs and the network trail.
  const UUID_PATTERN =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
  // React useId tokens are render-count-dependent ("_r_1a7_", ":r12:").
  const USE_ID_PATTERN = /_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»/gu;
  const maskUuids = (value: string): string =>
    value.replace(UUID_PATTERN, 'uuid').replace(USE_ID_PATTERN, 'rid');

  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const element = node as Element;
    const attributes = [...element.attributes]
      .filter(
        (attribute) => !volatileAttributes.has(attribute.name.toLowerCase()),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(
        (attribute) =>
          `${attribute.name}=${JSON.stringify(maskUuids(attribute.value))}`,
      )
      .join(' ');
    const opening =
      attributes.length > 0
        ? `<${element.tagName.toLowerCase()} ${attributes}>`
        : `<${element.tagName.toLowerCase()}>`;
    const children = [...element.childNodes].map(serialize).join('');
    return `${opening}${children}</${element.tagName.toLowerCase()}>`;
  };

  return serialize(document.documentElement);
};
