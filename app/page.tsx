'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  loadGameState,
  saveGameState,
  initializeGame,
  clearGameState
} from '@/lib/storage';
import { GameState } from '@/lib/types';
import GameSetup from '@/components/admin/GameSetup';
import FacilitatorDashboard from '@/components/admin/FacilitatorDashboard';

export default function Home() {
  const { data: gameState, mutate } = useSWR<GameState | null>(
    'ttx-game-state',
    loadGameState,
    {
      fallbackData: null,
      revalidateOnFocus: false,
    }
  );

  function handleStartGame(gameName: string, selectedCompanies: any) {
    const newGame = initializeGame(gameName, selectedCompanies);
    mutate(newGame, false);
  }

  function handleResetGame() {
    if (confirm('Are you sure you want to reset the game? All progress will be lost.')) {
      clearGameState();
      mutate(null, false);
    }
  }

  function updateGameState(newState: GameState) {
    mutate(newState, false); // Optimistic update
    saveGameState(newState);
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <GameSetup onStart={handleStartGame} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FacilitatorDashboard
        gameState={gameState}
        onUpdate={updateGameState}
        onReset={handleResetGame}
      />
    </div>
  );
}
