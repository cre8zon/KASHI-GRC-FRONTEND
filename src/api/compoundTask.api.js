import api from '../config/axios.config'
 
export const compoundTaskApi = {
  progress:      (taskInstanceId) =>
    api.get(`/v1/compound-tasks/${taskInstanceId}/progress`),
  saveDraft:     (taskInstanceId, draftData) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/draft`,
      JSON.stringify(draftData), { headers: { 'Content-Type': 'application/json' } }),
  getDraft:      (taskInstanceId) =>
    api.get(`/v1/compound-tasks/${taskInstanceId}/draft`),
  assignSection: (taskInstanceId, sectionKey, assigneeUserIds, notes) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/assign`,
      { assigneeUserIds, notes }),
  completeSubTask: (subTaskInstanceId) =>
    api.post(`/v1/compound-tasks/sub-tasks/${subTaskInstanceId}/complete`),
  registerItems: (taskInstanceId, sectionKey, items) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items`, items),
  assignItems:   (taskInstanceId, sectionKey, itemIds, assignedToUserId) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items/assign`,
      { itemIds, assignedToUserId }),
  completeItem:  (taskInstanceId, sectionKey, itemId, payload) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items/${itemId}/complete`,
      payload),
}