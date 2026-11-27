import api from '../config/axios.config'

/**
 * The website assistant (www.kashiguard.com chat), as the Enquiries inbox
 * sees it — /v1/admin/site-assistant, same permissions as the inbox.
 */
const S = '/v1/admin/site-assistant'

export const siteAssistantApi = {
  chat:         (enquiryId)        => api.get(`${S}/enquiries/${enquiryId}/chat`),
  reply:        (enquiryId, body)  => api.post(`${S}/enquiries/${enquiryId}/reply`, { body }),
  unanswered:   (days = 30)        => api.get(`${S}/unanswered`, { params: { days } }),
  pages:        ()                 => api.get(`${S}/pages`),
  reindexPosts: ()                 => api.post(`${S}/reindex-posts`),
}
