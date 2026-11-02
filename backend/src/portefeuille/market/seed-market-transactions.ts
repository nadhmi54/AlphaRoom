import { DataSource } from 'typeorm';

/**
 * Script manuel pour préparer un environnement de test.
 * Usage: node --env-file=.env -r tsx/cjs src/portefeuille/market/seed-market-transactions.ts
 */
async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('Connexion établie pour le seed...');

    // On cherche un profil existant ou on en propose un
    const profiles = await dataSource.query('SELECT id, email FROM public.profiles LIMIT 1');
    if (profiles.length === 0) {
      console.log('Aucun profil trouvé. Créez un compte via le frontend d\'abord.');
      return;
    }

    const profileId = profiles[0].id;
    console.log(`Utilisation du profil: ${profiles[0].email} (${profileId})`);

    // Note: On ne crée pas de trade_executions pour ne pas casser les invariants cash/positions
    // du module portefeuille d'un coéquipier. Ce script sert d'exemple de structure.
    
    console.log('Seed terminé avec succès (aucune donnée sensible modifiée).');
  } catch (error) {
    console.error('Erreur lors du seed:', error);
  } finally {
    await dataSource.destroy();
  }
}

seed();
