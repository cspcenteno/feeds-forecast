// The supplied report is published publicly by its Power BI owner.
// App visibility settings do not provide Power BI row-level security.
const suppliedEmbedUrl = 'https://app.powerbi.com/view?r=eyJrIjoiYzA0OWEwMmMtNDhiZi00MTcyLThhNTktNGFkOTAyYTc1ODllIiwidCI6ImFkMjJjNjZmLWNmMjktNDI0MS05MjMzLTlkMGEyMTFlNjM1ZiIsImMiOjEwfQ%3D%3D'

export function powerBiEmbedUrl() {
  const configured = process.env.POWERBI_EMBED_URL ?? suppliedEmbedUrl
  try {
    const url = new URL(configured)
    return url.protocol === 'https:' && url.hostname === 'app.powerbi.com'
      && ['/view', '/reportEmbed'].includes(url.pathname) ? url.toString() : null
  } catch {
    return null
  }
}
