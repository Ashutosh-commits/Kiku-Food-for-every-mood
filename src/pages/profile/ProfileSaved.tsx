import { useEffect, useState } from "react";
<<<<<<< HEAD
import { getKikuSavedItems, removeKikuSavedDish, removeKikuSavedRecipe, removeKikuSavedRestaurant } from "../../stores/profile-store";

const Empty = ({ type }) => (<div className="profile-empty-state"><span aria-hidden="true">♡</span><h2>No saved {type} yet</h2><p>Tap the heart on food or recipes you want Kiku to remember for later.</p></div>);
=======
import { getKikuSavedItems, removeKikuSavedDish, removeKikuSavedRecipe } from "../../stores/profile-store";

const Empty = ({ type }) => (
  <div className="profile-empty-state">
    <span aria-hidden="true">♡</span>
    <h2>No saved {type} yet</h2>
    <p>Tap the heart on dishes or recipes you want Kiku to remember for later.</p>
  </div>
);
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc

export default function ProfileSavedPage({ onBack, onOpenDish, onOpenRecipe }) {
  const [tab, setTab] = useState("dishes");
  const [saved, setSaved] = useState(getKikuSavedItems);
<<<<<<< HEAD
  useEffect(() => { const sync = (event) => setSaved(event.detail || getKikuSavedItems()); window.addEventListener("kiku-saved-change", sync); return () => window.removeEventListener("kiku-saved-change", sync); }, []);
  const dishes = saved.dishes || [];
  const recipes = saved.recipes || [];
  const restaurants = saved.restaurants || [];
  return (
    <section className="kiku-subpage" aria-label="Saved dishes, restaurants and recipes">
      <div className="kiku-subpage-header"><button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button><div><span className="eyebrow">YOUR KIKU COLLECTION</span><h1>Saved food &amp; recipes</h1><p>Keep the food you love close and come back whenever the moment feels right.</p></div></div>
      <div className="kiku-segmented-tabs" role="tablist" aria-label="Saved items">
        <button type="button" className={tab === "dishes" ? "active" : ""} onClick={() => setTab("dishes")}>Dishes <span>{dishes.length}</span></button>
        <button type="button" className={tab === "restaurants" ? "active" : ""} onClick={() => setTab("restaurants")}>Restaurants <span>{restaurants.length}</span></button>
        <button type="button" className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>Recipes <span>{recipes.length}</span></button>
      </div>
      {tab === "dishes" ? (dishes.length ? <div className="profile-saved-grid">{dishes.map((dish) => <article className="profile-saved-card" key={dish.name}><button type="button" className="profile-saved-art" onClick={() => onOpenDish(dish)} aria-label={`Open ${dish.name}`}><span>{dish.art || "🍽️"}</span></button><div className="profile-saved-copy"><strong>{dish.name}</strong><span>{dish.restaurant}</span><small>{dish.descriptor}</small></div><button type="button" className="profile-remove-button" onClick={() => removeKikuSavedDish(dish.name)} aria-label={`Remove ${dish.name}`}>♥</button></article>)}</div> : <Empty type="dishes" />)
        : tab === "restaurants" ? (restaurants.length ? <div className="profile-saved-list">{restaurants.map((restaurant) => <article className="profile-saved-recipe" key={restaurant.name}><div><span className="profile-saved-recipe-badge">RESTAURANT</span><strong>{restaurant.name}</strong><small>{restaurant.cuisine || "Multi-cuisine"}</small></div><div className="profile-saved-recipe-actions"><button type="button" className="danger-link" onClick={() => removeKikuSavedRestaurant(restaurant.name)}>Remove</button></div></article>)}</div> : <Empty type="restaurants" />)
        : (recipes.length ? <div className="profile-saved-list">{recipes.map((recipe) => <article className="profile-saved-recipe" key={recipe.name}><div><span className="profile-saved-recipe-badge">RECIPE</span><strong>{recipe.name}</strong><p>{recipe.description}</p><small>{recipe.time || "Not provided by source"}</small></div><div className="profile-saved-recipe-actions"><button type="button" onClick={() => onOpenRecipe(recipe)}>Open</button><button type="button" className="danger-link" onClick={() => removeKikuSavedRecipe(recipe.name)}>Remove</button></div></article>)}</div> : <Empty type="recipes" />)}
=======

  useEffect(() => {
    const sync = (event) => setSaved(event.detail || getKikuSavedItems());
    window.addEventListener("kiku-saved-change", sync);
    return () => window.removeEventListener("kiku-saved-change", sync);
  }, []);

  const dishes = saved.dishes || [];
  const recipes = saved.recipes || [];

  return (
    <section className="kiku-subpage" aria-label="Saved dishes and recipes">
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span className="eyebrow">YOUR KIKU COLLECTION</span><h1>Saved dishes &amp; recipes</h1><p>Keep the food you love close and come back to it whenever the moment feels right.</p></div>
      </div>

      <div className="kiku-segmented-tabs" role="tablist" aria-label="Saved items">
        <button type="button" className={tab === "dishes" ? "active" : ""} onClick={() => setTab("dishes")}>Dishes <span>{dishes.length}</span></button>
        <button type="button" className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>Recipes <span>{recipes.length}</span></button>
      </div>

      {tab === "dishes" ? (
        dishes.length ? (
          <div className="profile-saved-grid">
            {dishes.map((dish) => (
              <article className="profile-saved-card" key={dish.name}>
                <button type="button" className="profile-saved-art" onClick={() => onOpenDish(dish)} aria-label={`Open ${dish.name}`}><span>{dish.art || "🍽️"}</span></button>
                <div className="profile-saved-copy"><strong>{dish.name}</strong><span>{dish.restaurant}</span><small>{dish.descriptor}</small></div>
                <button type="button" className="profile-remove-button" onClick={() => removeKikuSavedDish(dish.name)} aria-label={`Remove ${dish.name}`}>♥</button>
              </article>
            ))}
          </div>
        ) : <Empty type="dishes" />
      ) : (
        recipes.length ? (
          <div className="profile-saved-list">
            {recipes.map((recipe) => (
              <article className="profile-saved-recipe" key={recipe.name}>
                <div><span className="profile-saved-recipe-badge">RECIPE</span><strong>{recipe.name}</strong><p>{recipe.description || recipe.descriptor}</p><small>{recipe.time || "30 min"}</small></div>
                <div className="profile-saved-recipe-actions"><button type="button" onClick={() => onOpenRecipe(recipe)}>Open</button><button type="button" className="danger-link" onClick={() => removeKikuSavedRecipe(recipe.name)}>Remove</button></div>
              </article>
            ))}
          </div>
        ) : <Empty type="recipes" />
      )}
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
    </section>
  );
}
