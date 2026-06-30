
const menuItems = [
  "Upload Candidates",
  "Job Description",
  "Run Pipeline",
  "Ranking Dashboard",
  "Send Tests",
  "Upload Test Results",
  "Shortlisted Candidates",
  "Schedule Interviews"
];
function Sidebar({ active, setActive }) {
  return (
    <div className="sidebar ">
      <h2>VISL AI</h2>

      {menuItems.map((item, i) => (
        <button
          key={i}
          className={active === i ? "menu active" : "menu"}
          onClick={() => setActive(i)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
export default Sidebar;