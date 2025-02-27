import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"

export const storageMappingHot = {
	45: { ram: "1GB", cpu: "2.5 vCPU" },
	90: { ram: "2GB", cpu: "2.5 vCPU" },
	180: { ram: "4GB", cpu: "2.5 vCPU" },
	360: { ram: "8GB", cpu: "2.5 vCPU" },
	720: { ram: "16GB", cpu: "5 vCPU" },
	1410: { ram: "32GB", cpu: "5 vCPU" }, // 1.41TB → 1410GB
	2810: { ram: "64GB", cpu: "10 vCPU" }, // 2.81TB → 2810GB
}
export const storageMappingWarm = {
	380: { ram: "2GB", cpu: "2.5 vCPU" },
	760: { ram: "4GB", cpu: "2.5 vCPU" },
	1480: { ram: "8GB", cpu: "2.5 vCPU" },
	2970: { ram: "16GB", cpu: "5 vCPU" },
	5940: { ram: "32GB", cpu: "5 vCPU" }, // 1.41TB → 1410GB
	11880: { ram: "64GB", cpu: "10 vCPU" }, // 2.81TB → 2810GB
}
export const storageMappingCold = {
	380: { ram: "2GB", cpu: "2.5 vCPU" },
	760: { ram: "4GB", cpu: "2.5 vCPU" },
	1480: { ram: "8GB", cpu: "2.5 vCPU" },
	2970: { ram: "16GB", cpu: "2.5 vCPU" },
	5940: { ram: "16GB", cpu: "5 vCPU" },
	11880: { ram: "32GB", cpu: "5 vCPU" }, // 1.41TB → 1410GB
	23760: { ram: "64GB", cpu: "10 vCPU" }, // 2.81TB → 2810GB
}

// export const getNearestUpperStorageValue = (storageInMB) => {
//   const storageInGB = storageInMB / 1024; // Convert MB to GB
//   const storageKeys = Object.keys(storageMapping)
//     .map(Number)
//     .sort((a, b) => a - b);

//   for (let i = 0; i < storageKeys.length; i++) {
//     if (storageInGB <= storageKeys[i]) {
//       return storageKeys[i]; // Return only the storage key
//     }
//   }

//   return null; // Return null if no upper limit found
// };
export const getRamInMBHot = (storageValue) => {
	const mapping = storageMappingHot[storageValue]
	if (!mapping) return 0 // Return null if storage value is not found

	const ramInGB = parseInt(mapping.ram.match(/\d+/)[0], 10) // Extract RAM in GB
	console.log(ramInGB)
	return ramInGB * 1024 // Convert GB to MB
}

export const getRamInMBWarm = (storageValue) => {
	const mapping = storageMappingWarm[storageValue]
	if (!mapping) return 0 // Return null if storage value is not found

	const ramInGB = parseInt(mapping.ram.match(/\d+/)[0], 10) // Extract RAM in GB
	console.log(ramInGB)
	return ramInGB * 1024 // Convert GB to MB
}

export const getRamInMBCold = (storageValue) => {
	const mapping = storageMappingCold[storageValue]
	if (!mapping) return 0 // Return null if storage value is not found

	const ramInGB = parseInt(mapping.ram.match(/\d+/)[0], 10) // Extract RAM in GB
	console.log(ramInGB)
	return ramInGB * 1024 // Convert GB to MB
}

export const verifyToken = (req, res, next) => {
	const token = req.headers["authorization"]
	if (!token) return res.status(403).json({ message: "Access denied" })

	jwt.verify(token.split(" ")[1], process.env.JWT_SECRET, (err, decoded) => {
		if (err) return res.status(401).json({ message: "Invalid token" })
		req.user = decoded
		next()
	})
}

export const evalBcrypts = async (pass) => {
	return await bcrypt.hash(pass, 10)
}
export const users = [
	{
		username: "elastic-service-account",
		hashedPassword: "$2b$10$u9mbeW3aWdutkGqGPCjU1Oc2NcZnt5mCn.2XGgZw913U5PWCi72Iy",
	},
]
