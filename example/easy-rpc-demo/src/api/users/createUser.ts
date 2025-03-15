export type CreateUserRequest = {
	name: string;
	email: string;
};

export type CreateUserResponse = {
	id: string;
	name: string;
	email: string;
};

export default async function createUser(body: CreateUserRequest): Promise<CreateUserResponse> {
	return {
		id: '123',
		name: body.name,
		email: body.email,
	};
}
