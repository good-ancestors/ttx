/**
 * LocalStorage utilities for game state persistence
 * V1: All state lives in browser localStorage
 */

import { GameState, Company } from './types';
import { STORAGE_KEY, INITIAL_GLOBAL_COMPUTE, TOTAL_ROUNDS, DEFAULT_COMPANIES, createCompany } from './constants';

/**
 * Save game state to localStorage
 */
export function saveGameState(state: GameState): void {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Failed to save game state:', error);
  }
}

/**
 * Load game state from localStorage
 * Returns null if no game exists
 */
export function loadGameState(): GameState | null {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;

    const state = JSON.parse(serialized) as GameState;
    return state;
  } catch (error) {
    console.error('Failed to load game state:', error);
    return null;
  }
}

/**
 * Clear game state (start fresh)
 */
export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear game state:', error);
  }
}

/**
 * Export game state as JSON string (for backup/sharing)
 */
export function exportGameState(): string | null {
  try {
    const state = loadGameState();
    if (!state) return null;

    return JSON.stringify(state, null, 2);
  } catch (error) {
    console.error('Failed to export game state:', error);
    return null;
  }
}

/**
 * Import game state from JSON string
 */
export function importGameState(jsonString: string): GameState | null {
  try {
    const state = JSON.parse(jsonString) as GameState;
    saveGameState(state);
    return state;
  } catch (error) {
    console.error('Failed to import game state:', error);
    return null;
  }
}

/**
 * Initialize a new game with selected companies
 */
export function initializeGame(
  name: string,
  selectedCompanies: Array<{
    name: string;
    compute: number;
    rdAllocation: number;
    safetyAllocation: number;
  }>
): GameState {
  // Companies start with their selected initial compute as stock
  const companies = selectedCompanies.map((config) =>
    createCompany(config.name, config.compute, config.rdAllocation, config.safetyAllocation)
  );

  // Round 1 allocates NEW compute (50% growth on top of initial stock to reach 1.5x total)
  const currentStock = selectedCompanies.reduce((sum, c) => sum + c.compute, 0);
  const newComputeQ1 = Math.round(currentStock * 0.5); // 50% growth

  const gameState: GameState = {
    id: `game-${Date.now()}`,
    name,
    currentRound: 1,
    totalRounds: TOTAL_ROUNDS,
    globalCompute: newComputeQ1, // NEW compute available to allocate in Quarter 1
    companies,
    roundHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveGameState(gameState);
  return gameState;
}

/**
 * Check if game state exists in localStorage
 */
export function hasGameState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
