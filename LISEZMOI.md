# SikaGest — Logiciel de gestion commerciale

Caisse (POS), ventes et factures, achats, stock, clients et fournisseurs, dépenses, rapports, utilisateurs. Fonctionne **sans Internet**. Internet sert seulement aux **mises à jour automatiques**.

## Ce que fait le logiciel

| Module | Fonctions |
|---|---|
| Tableau de bord | Total des ventes, encaissé, factures impayées, bénéfice net, achats, achats impayés, dépenses, valeur du stock, graphique sur 30 jours, meilleurs produits, alertes de stock |
| Caisse (POS) | Grille de produits, recherche et lecteur de code-barres, panier, remise, monnaie à rendre, vente à crédit, ticket 80 mm |
| Ventes | Factures A4, paiements partiels, retours clients, annulation (admin), export Excel |
| Achats | Bons d'achat, entrée en stock, mise à jour du prix d'achat, paiements fournisseurs, retours |
| Produits | Catalogue, catégories, codes-barres, unités, seuil d'alerte, ajustements et inventaire |
| Mouvements de stock | Historique de chaque entrée et sortie |
| Clients & fournisseurs | Fiches, historique, montant dû |
| Dépenses | Loyer, salaires, électricité, etc. |
| Rapports | Compte de résultat, trésorerie, créances, produits vendus, impression |
| Utilisateurs | Rôles « Administrateur » et « Vendeur » |
| Paramètres | Infos de l'entreprise, monnaie, format du ticket, sauvegarde et restauration, mises à jour |

## Les deux versions pour Windows

- **SikaGest-Installation-x.y.z.exe** : double-cliquez pour installer. **Pas besoin d'Internet** pour installer ni pour utiliser le logiciel. Pas besoin non plus d'être administrateur du PC. Un raccourci est créé sur le bureau. Dès que le PC a Internet, le logiciel cherche les nouvelles versions et les installe tout seul.
- **SikaGest-Portable-x.y.z.zip** : décompressez le dossier sur une **clé USB**, puis lancez `SikaGest.exe`. Les données restent dans `SikaGest-donnees`, sur la clé. Quand une nouvelle version sort, le logiciel l'annonce et ouvre le lien de téléchargement.

Vous pouvez copier l'installateur sur une clé et l'installer sur autant de PC que vous voulez.

Les données sont dans une base SQLite, dans `%APPDATA%\SikaGest` pour la version installée. Une sauvegarde automatique est faite chaque jour (les 10 dernières sont gardées). Pour passer d'un PC à un autre : **Paramètres → Créer une sauvegarde**, puis **Restaurer** sur l'autre PC. Désinstaller le logiciel ne supprime pas les données.

---

## 1. Activer les mises à jour à distance (une seule fois)

1. Sur https://github.com, créez un dépôt **public** nommé `sikagest`. Il doit être public pour que les PC de vos clients puissent télécharger les mises à jour sans mot de passe.
2. Envoyez-y tous les fichiers de ce dossier.
3. Dans `package.json`, la rubrique `"updates"` doit contenir votre compte GitHub (`"owner"`) et le nom du dépôt (`"repo"`).

## 2. Envoyer une mise à jour à tous vos clients

1. Modifiez le code.
2. Dans `package.json`, augmentez `"version"` (par ex. `1.0.0` → `1.0.1`).
3. Envoyez les fichiers sur GitHub (branche `main`). La nouvelle version est publiée automatiquement. Vous pouvez aussi la publier vous-même : onglet **Actions → Publier une version → Run workflow**.
4. GitHub fabrique automatiquement les nouveaux fichiers, en 5 minutes environ (onglet **Actions**).
5. Chaque PC client qui se connecte à Internet télécharge la mise à jour en arrière-plan. Un bouton vert « Mise à jour prête — redémarrer » apparaît. Si personne ne clique, elle s'installe à la fermeture du logiciel. Les données ne sont pas touchées.

⚠️ Il faut toujours augmenter le numéro de version : les PC installent seulement une version plus récente que la leur.

## 3. Pour les développeurs

```bash
npm run preview          # aperçu dans un navigateur : http://localhost:5178
bash tools/build-windows.sh   # fabrique dist/*.exe et dist/*.zip (depuis Linux, sans Windows)
```

Structure :

```
src/main.js            fenêtre, sauvegardes, emplacement des données
src/db.js              base de données et toutes les règles de gestion
src/updater.js         mises à jour automatiques (GitHub Releases)
src/preload.js         pont sécurisé entre l'interface et les données
renderer/              interface (HTML, CSS, JavaScript)
tools/build-windows.sh fabrication des fichiers Windows (Electron 37 + SQLite)
tools/installer.nsi    script de l'installateur
.github/workflows/     fabrication et publication automatiques
```

## Remarques

- **Windows SmartScreen** : au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur ». Cliquez sur *Informations complémentaires → Exécuter quand même*. Pour supprimer cet avertissement, il faut acheter un certificat de signature de code (environ 100 à 300 € par an).
- **Changer le nom** : remplacez « SikaGest » dans `package.json`, `tools/`, `renderer/` et `build/icon.*`.
- **Icône du fichier .exe** : les raccourcis et la fenêtre affichent l'icône SikaGest, mais le fichier `SikaGest.exe` garde l'icône d'Electron.
- **Plusieurs caisses sur un même stock** : cette version fonctionne avec une base de données par PC. Pour partager le stock entre plusieurs PC ou boutiques, il faudra ajouter un serveur en ligne (évolution possible).
