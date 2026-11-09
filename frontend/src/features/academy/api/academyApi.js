import { apiFetch } from '../../../services/apiClient.js';

// Module Academy — Formation, Pédagogie & Engagement.
// Toutes ces routes sont protégées par le JWT Supabase (voir apiFetch) et
// préfixées par /api côté backend. Aucun identifiant d'utilisateur n'est
// envoyé : le serveur travaille toujours sur le profil du jeton.

// Catalogue : cours déverrouillés ET verrouillés (avec leur condition).
export const getCatalog = () => apiFetch('/academy/courses');

// Détail d'un cours : refusé côté serveur s'il est verrouillé.
export const getCourse = (courseId) => apiFetch(`/academy/courses/${courseId}`);

// Quiz d'un cours (titre, seuil, nombre de questions — jamais les réponses).
export const getCourseQuizzes = (courseId) => apiFetch(`/academy/courses/${courseId}/quizzes`);

// Parcours par niveau du joueur : niveaux ouverts/verrouillés, cours validés,
// missions et badges de niveau. Calculé côté serveur.
export const getPath = () => apiFetch('/academy/path');

// Tirage d'un quiz du cours, fait par le serveur (le client ne choisit jamais
// le quiz). Renvoie un quiz sans ses réponses.
export const drawCourseQuiz = (courseId) =>
  apiFetch(`/academy/courses/${courseId}/quiz`, { method: 'POST' });

// Missions et défis, avec leurs critères et leur fenêtre de validité.
export const getMissions = () => apiFetch('/academy/missions');

// Progression du joueur : XP, niveau et avancement par compétence.
export const getMyProgress = () => apiFetch('/academy/progress/me');

// Avancement sur une leçon (in_progress ou completed). Le score d'un quiz est
// enregistré par le serveur lors de la soumission, pas ici.
export const updateLessonProgress = (lessonId, body) =>
  apiFetch(`/academy/lessons/${lessonId}/progress`, { method: 'PUT', body });

// Catalogue des badges et badges obtenus par le joueur.
export const listBadges = () => apiFetch('/academy/badges');
export const getMyBadges = () => apiFetch('/academy/badges/me');

// Passage d'un quiz : questions sans réponses, puis correction côté serveur.
export const getQuiz = (quizId) => apiFetch(`/academy/quizzes/${quizId}`);
export const submitQuiz = (quizId, answers) =>
  apiFetch(`/academy/quizzes/${quizId}/submissions`, { method: 'POST', body: { answers } });
