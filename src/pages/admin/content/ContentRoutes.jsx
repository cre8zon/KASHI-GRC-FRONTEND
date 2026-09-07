import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { PageSkeleton } from '../../../components/ui/EmptyState'

/**
 * The blog's route subtree, mounted once in App.jsx:
 *
 *   <Route path="/content/*" element={<ContentRoutes />} />
 *
 * Kept separate on purpose. This module shares the design system, the axios
 * client and the UI primitives with the rest of the admin, and nothing else —
 * no UniversalModulePage, no blueprint, no ui_config. A blog post is not
 * another record in a compliance module, and modelling it as one would mean
 * expressing a block editor as configuration.
 *
 * The practical benefit is that this whole tree can be deleted, or split into
 * its own deploy, without touching anything else.
 */
const PostListPage       = lazy(() => import('./PostListPage'))
const PostEditorPage     = lazy(() => import('./PostEditorPage'))
const ContentReportsPage = lazy(() => import('./ContentReportsPage'))
const TaxonomyPage       = lazy(() => import('./TaxonomyPage'))

export default function ContentRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route index element={<Navigate to="posts" replace />} />
        <Route path="posts" element={<PostListPage />} />
        <Route path="posts/:id" element={<PostEditorPage />} />
        <Route path="reports" element={<ContentReportsPage />} />
        <Route path="taxonomy" element={<TaxonomyPage />} />
      </Routes>
    </Suspense>
  )
}